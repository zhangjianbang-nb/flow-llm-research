#!/usr/bin/env node
/**
 * Toy experiment: factorized parallel decoding vs joint continuous transport.
 *
 * Data: two independent "slots", each a correlated token pair drawn from
 *   new-york, san-diego, los-angeles, hong-kong, tel-aviv, rio-janeiro.
 * A sequence is L=4 tokens = two pairs. A sample is INVALID if either pair
 * is a mixture of two different cities.
 *
 * Three oracle decoders (no learning error, isolates the geometry):
 *   A. discrete factorized: masked diffusion-style parallel commits. Each
 *      position gets a random commit step in 1..N; positions committing at
 *      the same step are sampled independently from their marginals.
 *   B. continuous factorized: exact flow-matching velocity for each position,
 *      using only that position's own noisy state (a diagonal denoiser).
 *   C. continuous joint: exact flow-matching velocity using both positions
 *      of the pair (block-bidirectional denoiser, as in Lafa/FMLM).
 *
 * Metrics vs NFE N: invalid-mixture rate, TV distance of the generated pair
 * distribution to the true distribution, and normalized entropy (mode collapse).
 * Also records per-timestep posterior entropy / true-pair probability.
 *
 * Run: node experiment/toy_flow_vs_diffusion.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const PAIRS = [
  { a: 'new', b: 'york', p: 0.30 },
  { a: 'san', b: 'diego', p: 0.24 },
  { a: 'los', b: 'angeles', p: 0.16 },
  { a: 'hong', b: 'kong', p: 0.12 },
  { a: 'tel', b: 'aviv', p: 0.10 },
  { a: 'rio', b: 'janeiro', p: 0.08 },
];
const K = PAIRS.length;
const V = 2 * K;
const PRIOR = PAIRS.map((d) => d.p);
const SUM_P2 = PRIOR.reduce((s, p) => s + p * p, 0);
const N_GRID = [1, 2, 4, 8, 16, 32, 64];
const SEEDS = [11, 23, 37];
const SEQ_PER_SEED = 5000;

// ---------- RNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function samplePair(rng) {
  const u = rng();
  let c = 0;
  for (let k = 0; k < K; k++) { c += PRIOR[k]; if (u < c) return k; }
  return K - 1;
}
function argmax(a) {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
}
function onehot(i) {
  const e = new Array(V).fill(0);
  e[i] = 1;
  return e;
}
function softmaxLog(logits) {
  const m = Math.max(...logits);
  const ex = logits.map((z) => Math.exp(z - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((z) => z / s);
}
function entropy(p) {
  let h = 0;
  for (const q of p) if (q > 1e-15) h -= q * Math.log(q);
  return h;
}
function tv(genCounts, total) {
  let d = 0;
  for (let k = 0; k < K; k++) d += Math.abs(genCounts[k] / total - PRIOR[k]);
  return 0.5 * d;
}

// ---------- discrete factorized ----------
function runDiscrete(N, nSeq, rng) {
  let invalidPairs = 0;
  let invalidSeq = 0;
  const pairCounts = new Array(K).fill(0);
  for (let s = 0; s < nSeq; s++) {
    let seqBad = false;
    for (let slot = 0; slot < 2; slot++) {
      const k = samplePair(rng);
      const stepA = 1 + Math.floor(rng() * N);
      const stepB = 1 + Math.floor(rng() * N);
      let tokA, tokB;
      if (stepA < stepB) {
        // A commits first, from its marginal; B then conditions on A.
        tokA = 2 * samplePair(rng);
        tokB = tokA + 1;
      } else if (stepB < stepA) {
        tokB = 2 * samplePair(rng) + 1;
        tokA = tokB - 1;
      } else {
        // Simultaneous commit: two independent marginal samples.
        tokA = 2 * samplePair(rng);
        tokB = 2 * samplePair(rng) + 1;
      }
      const valid = tokB === tokA + 1;
      if (!valid) { invalidPairs++; seqBad = true; }
      // Record the first token's pair index for the distribution metric.
      pairCounts[Math.floor(tokA / 2)]++;
    }
    if (seqBad) invalidSeq++;
  }
  const nPairs = nSeq * 2;
  return {
    invalidRate: invalidPairs / nPairs,
    invalidSeqRate: invalidSeq / nSeq,
    tv: tv(pairCounts, nPairs),
    entropyNorm: entropy(pairCounts.map((c) => c / nPairs)) / Math.log(K),
  };
}

// ---------- continuous flow ----------
function jointPosterior(x0, x1, t) {
  const denom = 2 * (1 - t) * (1 - t);
  const logits = new Array(K);
  for (let k = 0; k < K; k++) {
    let d = 0;
    const ea = 2 * k, eb = 2 * k + 1;
    for (let j = 0; j < V; j++) {
      const ta = j === ea ? t : 0;
      const tb = j === eb ? t : 0;
      d += (x0[j] - ta) ** 2 + (x1[j] - tb) ** 2;
    }
    logits[k] = Math.log(PRIOR[k]) - d / denom;
  }
  return softmaxLog(logits);
}
function marginalPosterior(x, t, first) {
  const denom = 2 * (1 - t) * (1 - t);
  const logits = new Array(V).fill(-Infinity);
  for (let k = 0; k < K; k++) {
    const tok = first ? 2 * k : 2 * k + 1;
    let d = 0;
    for (let j = 0; j < V; j++) {
      const target = j === tok ? t : 0;
      d += (x[j] - target) ** 2;
    }
    logits[tok] = Math.log(PRIOR[k]) - d / denom;
  }
  return softmaxLog(logits);
}
function expectedOnehot(q) {
  const e = new Array(V).fill(0);
  for (let j = 0; j < V; j++) e[j] = q[j];
  return e;
}
function runContinuous(N, nSeq, rng, joint, record = false) {
  let invalidPairs = 0;
  let invalidSeq = 0;
  const pairCounts = new Array(K).fill(0);
  const acc = record ? {
    t: Array.from({ length: N }, (_, i) => i / N),
    jointH: new Array(N).fill(0), factorH: new Array(N).fill(0),
    jointMax: new Array(N).fill(0), factorMax: new Array(N).fill(0),
    count: new Array(N).fill(0),
  } : null;
  for (let s = 0; s < nSeq; s++) {
    let seqBad = false;
    for (let slot = 0; slot < 2; slot++) {
      const k = samplePair(rng);
      const ea = 2 * k, eb = 2 * k + 1;
      let x0 = Array.from({ length: V }, () => gauss(rng));
      let x1 = Array.from({ length: V }, () => gauss(rng));
      for (let step = 0; step < N; step++) {
        const t = step / N;
        const dt = 1 / N;
        if (record && slot === 0) {
          const jp = jointPosterior(x0, x1, t);
          const q0 = marginalPosterior(x0, t, true);
          const q1 = marginalPosterior(x1, t, false);
          const fp = new Array(K);
          let z = 0;
          for (let kk = 0; kk < K; kk++) { fp[kk] = q0[2 * kk] * q1[2 * kk + 1]; z += fp[kk]; }
          for (let kk = 0; kk < K; kk++) fp[kk] /= z;
          acc.jointH[step] += entropy(jp) / Math.log(K);
          acc.factorH[step] += entropy(fp) / Math.log(K);
          acc.jointMax[step] += Math.max(...jp);
          acc.factorMax[step] += Math.max(...fp);
          acc.count[step] += 1;
        }
        let e0, e1;
        if (joint) {
          const w = jointPosterior(x0, x1, t);
          e0 = new Array(V).fill(0);
          e1 = new Array(V).fill(0);
          for (let kk = 0; kk < K; kk++) {
            e0[2 * kk] += w[kk];
            e1[2 * kk + 1] += w[kk];
          }
        } else {
          const q0 = marginalPosterior(x0, t, true);
          const q1 = marginalPosterior(x1, t, false);
          e0 = expectedOnehot(q0);
          e1 = expectedOnehot(q1);
        }
        const inv = 1 / (1 - t);
        for (let j = 0; j < V; j++) {
          x0[j] += dt * (e0[j] - x0[j]) * inv;
          x1[j] += dt * (e1[j] - x1[j]) * inv;
        }
      }
      const tokA = argmax(x0);
      const tokB = argmax(x1);
      const valid = tokB === tokA + 1;
      if (!valid) { invalidPairs++; seqBad = true; }
      pairCounts[Math.floor(tokA / 2)]++;
    }
    if (seqBad) invalidSeq++;
  }
  const nPairs = nSeq * 2;
  const trace = record ? {
    t: acc.t,
    jointH: acc.jointH.map((v, i) => v / acc.count[i]),
    factorH: acc.factorH.map((v, i) => v / acc.count[i]),
    jointMax: acc.jointMax.map((v, i) => v / acc.count[i]),
    factorMax: acc.factorMax.map((v, i) => v / acc.count[i]),
  } : null;
  return {
    invalidRate: invalidPairs / nPairs,
    invalidSeqRate: invalidSeq / nSeq,
    tv: tv(pairCounts, nPairs),
    entropyNorm: entropy(pairCounts.map((c) => c / nPairs)) / Math.log(K),
    trace,
  };
}

function meanStd(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
  return { mean: m, std: Math.sqrt(v) };
}

// ---------- run ----------
const results = { meta: { pairs: PAIRS, N_GRID, SEEDS, SEQ_PER_SEED, sumP2: SUM_P2 }, curves: {}, trace: null, samples: {} };
const arms = [
  { id: 'discrete', label: '离散因子化并行（masked diffusion）', run: (N, n, rng) => runDiscrete(N, n, rng) },
  { id: 'flowFactor', label: '连续流 · 对角（仅看自身）', run: (N, n, rng) => runContinuous(N, n, rng, false) },
  { id: 'flowJoint', label: '连续流 · 联合（看整块）', run: (N, n, rng) => runContinuous(N, n, rng, true) },
];
for (const arm of arms) {
  const rows = [];
  for (const N of N_GRID) {
    const runs = SEEDS.map((seed) => arm.run(N, SEQ_PER_SEED, mulberry32(seed)));
    const invalid = meanStd(runs.map((r) => r.invalidRate));
    const invalidSeq = meanStd(runs.map((r) => r.invalidSeqRate));
    const tvv = meanStd(runs.map((r) => r.tv));
    const ent = meanStd(runs.map((r) => r.entropyNorm));
    rows.push({ N, invalid, invalidSeq, tv: tvv, entropy: ent, perSeed: runs.map((r) => ({ invalid: r.invalidRate, invalidSeq: r.invalidSeqRate, tv: r.tv, entropy: r.entropyNorm })) });
  }
  results.curves[arm.id] = { label: arm.label, rows };
}
// Analytic prediction for the discrete arm: a pair is corrupted iff both of its
// positions draw the same commit step, probability 1/N, and the two independent
// marginal draws disagree, probability 1 - sum_k p_k^2.
results.analytic = {
  discretePairInvalid: N_GRID.map((N) => ({ N, value: (1 / N) * (1 - SUM_P2) })),
  discreteSeqInvalid: N_GRID.map((N) => ({ N, value: 1 - Math.pow(1 - (1 / N) * (1 - SUM_P2), 2) })),
};

// trace with N=32, one seed
results.trace = runContinuous(32, 2000, mulberry32(101), true, true).trace;

// qualitative samples: 8 sequences per arm at N=8
function sampleSequences(armId, N, n, seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (let s = 0; s < n; s++) {
    const seq = [];
    for (let slot = 0; slot < 2; slot++) {
      const k = samplePair(rng);
      if (armId === 'discrete') {
        const stepA = 1 + Math.floor(rng() * N);
        const stepB = 1 + Math.floor(rng() * N);
        let ta, tb;
        if (stepA < stepB) { ta = 2 * samplePair(rng); tb = ta + 1; }
        else if (stepB < stepA) { tb = 2 * samplePair(rng) + 1; ta = tb - 1; }
        else { ta = 2 * samplePair(rng); tb = 2 * samplePair(rng) + 1; }
        seq.push(PAIRS[Math.floor(ta / 2)].a, tb === ta + 1 ? PAIRS[Math.floor(ta / 2)].b : PAIRS[Math.floor(tb / 2)].b);
      } else {
        const joint = armId === 'flowJoint';
        let x0 = Array.from({ length: V }, () => gauss(rng));
        let x1 = Array.from({ length: V }, () => gauss(rng));
        for (let step = 0; step < N; step++) {
          const t = step / N, dt = 1 / N;
          let e0, e1;
          if (joint) {
            const w = jointPosterior(x0, x1, t);
            e0 = new Array(V).fill(0); e1 = new Array(V).fill(0);
            for (let kk = 0; kk < K; kk++) { e0[2 * kk] += w[kk]; e1[2 * kk + 1] += w[kk]; }
          } else {
            e0 = expectedOnehot(marginalPosterior(x0, t, true));
            e1 = expectedOnehot(marginalPosterior(x1, t, false));
          }
          const inv = 1 / (1 - t);
          for (let j = 0; j < V; j++) { x0[j] += dt * (e0[j] - x0[j]) * inv; x1[j] += dt * (e1[j] - x1[j]) * inv; }
        }
        const ta = argmax(x0), tb = argmax(x1);
        seq.push(ta % 2 === 0 ? PAIRS[Math.floor(ta / 2)].a : PAIRS[Math.floor(ta / 2)].b);
        seq.push(tb % 2 === 1 ? PAIRS[Math.floor(tb / 2)].b : PAIRS[Math.floor(tb / 2)].a);
      }
    }
    out.push(seq);
  }
  return out;
}
for (const armId of ['discrete', 'flowFactor', 'flowJoint']) {
  results.samples[armId] = sampleSequences(armId, 8, 10, 7);
}

const outPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log('wrote', outPath);
for (const arm of arms) {
  console.log('\n' + arm.label);
  for (const r of results.curves[arm.id].rows) {
    console.log(`N=${String(r.N).padStart(2)}  pairInv=${(r.invalid.mean * 100).toFixed(2)}% ±${(r.invalid.std * 100).toFixed(2)}  seqInv=${(r.invalidSeq.mean * 100).toFixed(2)}%  TV=${r.tv.mean.toFixed(4)}  H/Hmax=${r.entropy.mean.toFixed(3)}`);
  }
}
