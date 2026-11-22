#!/usr/bin/env node
/** Render the toy-experiment figures as standalone, theme-aware SVGs. */
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const R = JSON.parse(fs.readFileSync(path.join(HERE, 'results.json'), 'utf8'));
const FIG = path.join(HERE, '..', 'figs');
fs.mkdirSync(FIG, { recursive: true });

const COL = {
  discrete: '#c05a3e',
  factor: '#5b6b7c',
  joint: '#1f6f68',
  gold: '#b8892f',
  paper: '#f7f3ea',
};
const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif";
const SERIF = "'Songti SC','Noto Serif SC',Georgia,serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f1 = (x) => x.toFixed(1);

function svg(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
  .ax{stroke:currentColor;stroke-width:1;opacity:.35}
  .grid{stroke:currentColor;stroke-width:1;opacity:.12}
  .tick{fill:currentColor;opacity:.62;font:12px ${SANS}}
  .lab{fill:currentColor;opacity:.78;font:13px ${SANS}}
  .strong{fill:currentColor;font:600 14px ${SANS}}
  .title{fill:currentColor;font:600 19px ${SERIF}}
  .note{fill:currentColor;opacity:.72;font:12px ${SANS}}
</style>
${body}
</svg>`;
}

function line(x1, y1, x2, y2, cls = 'ax') {
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" class="${cls}"/>`;
}
function text(x, y, s, cls = 'lab', anchor = 'start') {
  return `<text x="${f1(x)}" y="${f1(y)}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
}
function circle(x, y, r, fill) {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${COL.paper}" stroke-width="1.6"/>`;
}
function polyline(pts, color, width = 2.6, dash = '') {
  return `<polyline points="${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
function legendRow(x, y, items, gap) {
  let s = '';
  for (const it of items) {
    s += `<line x1="${x}" y1="${y}" x2="${x + 24}" y2="${y}" stroke="${it.color}" stroke-width="${it.width || 3}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`;
    s += text(x + 30, y + 4, it.name, 'note');
    x += gap;
  }
  return s;
}

const N = R.meta.N_GRID;
const xpos = (i, left, width) => left + (i * width) / (N.length - 1);
const seriesMeta = [
  { id: 'discrete', name: '离散因子化并行', color: COL.discrete },
  { id: 'flowFactor', name: '连续流 · 对角去噪', color: COL.factor },
  { id: 'flowJoint', name: '连续流 · 联合去噪', color: COL.joint },
];

// ---------------- Figure 1: invalid mixture rate ----------------
{
  const W = 960, H = 580, L = 96, RW = 40, T = 126, B = 82;
  const PW = W - L - RW, PH = H - T - B;
  const y = (v) => T + PH * (1 - v / 100);
  let body = '';
  body += text(L, 34, '并行提交的代价：非法混合率', 'title');
  body += text(L, 58, '两条相关 token 的序列，只要任一对被拼成「半座城市」就算非法；oracle 去噪器，无学习误差', 'note');
  body += legendRow(L, 86, seriesMeta.map((s) => ({ ...s })), 205);
  body += `<line x1="${L + 615}" y1="86" x2="${L + 639}" y2="86" stroke="${COL.discrete}" stroke-width="1.8" stroke-dasharray="6 5"/>`;
  body += text(L + 645, 90, '解析预测 (1/N)(1−Σp²)', 'note');

  for (let v = 0; v <= 100; v += 20) {
    body += line(L, y(v), L + PW, y(v), 'grid');
    body += text(L - 12, y(v) + 4, `${v}%`, 'tick', 'end');
  }
  body += line(L, T, L, T + PH, 'ax');
  body += line(L, T + PH, L + PW, T + PH, 'ax');
  N.forEach((n, i) => body += text(xpos(i, L, PW), T + PH + 24, String(n), 'tick', 'middle'));
  body += text(L + PW / 2, H - 26, '采样步数 N（对数刻度）', 'lab', 'middle');
  body += `<g transform="translate(${L - 58},${T + PH / 2}) rotate(-90)"><text x="0" y="0" class="lab" text-anchor="middle">非法混合率</text></g>`;

  const ap = R.analytic.discretePairInvalid.map((d, i) => [xpos(i, L, PW), y(d.value * 100)]);
  body += polyline(ap, COL.discrete, 1.8, '6 5');
  for (const s of seriesMeta) {
    const vals = R.curves[s.id].rows.map((r) => r.invalid.mean * 100);
    const pts = vals.map((v, i) => [xpos(i, L, PW), y(v)]);
    body += polyline(pts, s.color, 3);
    pts.forEach(([x, yy]) => { body += circle(x, yy, 4.2, s.color); });
  }
  body += text(xpos(6, L, PW) - 14, y(79.5) - 18, '79.5% 平台：每个位置都「对」，拼在一起错', 'note', 'end');
  body += text(xpos(1, L, PW) + 12, y(3), '联合流：0%，相关 token 被绑在一起', 'note');
  body += text(xpos(2, L, PW) + 12, y(20.4) - 16, '1/N 碰撞律', 'note');
  fs.writeFileSync(path.join(FIG, 'fig_invalid.svg'), svg(W, H, '非法混合率随采样步数变化', body));
}

// ---------------- Figure 2: TV distance ----------------
{
  const W = 960, H = 540, L = 96, RW = 40, T = 126, B = 76;
  const PW = W - L - RW, PH = H - T - B;
  const ymax = 0.75;
  const y = (v) => T + PH * (1 - v / ymax);
  let body = '';
  body += text(L, 34, '分布对不对：TV 距离', 'title');
  body += text(L, 58, '生成的两城市分布与真实分布的总变差；越低越好', 'note');
  body += legendRow(L, 86, seriesMeta.map((s) => ({ ...s })), 205);
  for (let v = 0; v <= 0.75; v += 0.15) {
    body += line(L, y(v), L + PW, y(v), 'grid');
    body += text(L - 12, y(v) + 4, v.toFixed(2), 'tick', 'end');
  }
  body += line(L, T, L, T + PH, 'ax');
  body += line(L, T + PH, L + PW, T + PH, 'ax');
  N.forEach((n, i) => body += text(xpos(i, L, PW), T + PH + 24, String(n), 'tick', 'middle'));
  body += text(L + PW / 2, H - 22, '采样步数 N（对数刻度）', 'lab', 'middle');
  body += `<g transform="translate(${L - 58},${T + PH / 2}) rotate(-90)"><text x="0" y="0" class="lab" text-anchor="middle">TV 距离</text></g>`;

  for (const s of seriesMeta) {
    const vals = R.curves[s.id].rows.map((r) => r.tv.mean);
    const pts = vals.map((v, i) => [xpos(i, L, PW), y(v)]);
    body += polyline(pts, s.color, 3);
    pts.forEach(([x, yy]) => { body += circle(x, yy, 4.2, s.color); });
  }
  body += text(xpos(0, L, PW) + 12, y(0.70) - 14, 'N=1：连续两臂都塌成「最可能的那座城」', 'note');
  body += text(xpos(6, L, PW) - 12, y(0.025) - 18, 'N≥4 后分布都已接近真实；差别在单样本合法性（见图 1）', 'note', 'end');
  fs.writeFileSync(path.join(FIG, 'fig_tv.svg'), svg(W, H, 'TV 距离随采样步数变化', body));
}

// ---------------- Figure 3: posterior entropy along the flow ----------------
{
  const W = 960, H = 450, L = 110, RW = 50, T = 120, B = 84;
  const PW = W - L - RW, PH = H - T - B;
  const tr = R.trace;
  const maxT = Math.max(...tr.t);
  const y = (v) => T + PH * (1 - v);
  let body = '';
  body += text(L, 34, '过早自信，还是谨慎收敛？', 'title');
  body += text(L, 58, '块级后验熵沿流时间的变化；熵低不等于对，可能只是把两个位置当成了独立证据', 'note');
  body += legendRow(L, 86, [
    { name: '联合（看整块）', color: COL.joint },
    { name: '对角（仅看自身）', color: COL.factor, dash: '6 5', width: 2.8 },
  ], 180);
  for (let v = 0; v <= 1; v += 0.25) {
    body += line(L, y(v), L + PW, y(v), 'grid');
    body += text(L - 12, y(v) + 4, v.toFixed(2), 'tick', 'end');
  }
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    body += text(L + PW * t, T + PH + 22, t.toFixed(2), 'tick', 'middle');
  });
  body += line(L, T, L, T + PH, 'ax');
  body += line(L, T + PH, L + PW, T + PH, 'ax');
  body += text(L + PW / 2, H - 26, '流时间 t', 'lab', 'middle');
  body += `<g transform="translate(${L - 56},${T + PH / 2}) rotate(-90)"><text x="0" y="0" class="lab" text-anchor="middle">归一化后验熵 H / log 6</text></g>`;

  for (const se of [
    { vals: tr.jointH, color: COL.joint },
    { vals: tr.factorH, color: COL.factor, dash: '6 5' },
  ]) {
    const pts = se.vals.map((v, i) => [L + PW * (tr.t[i] / maxT), y(v)]);
    body += polyline(pts, se.color, 2.8, se.dash || '');
  }
  // evidence-conflict band
  body += `<rect x="${f1(L + PW * 0.35)}" y="${T}" width="${f1(PW * 0.3)}" height="${PH}" fill="${COL.gold}" opacity=".06"/>`;
  body += text(L + PW * 0.5, T + 20, '证据冲突区', 'note', 'middle');
  body += text(L + PW * 0.52, y(0.68), '联合：先保留不确定性', 'note');
  body += text(L + PW * 0.30, y(0.40), '对角：更早自信，却常锁错组合', 'note', 'end');
  body += text(L + PW * 0.94, y(0.10), '两者最终都收敛', 'note', 'end');
  fs.writeFileSync(path.join(FIG, 'fig_entropy.svg'), svg(W, H, '块级后验熵沿流时间的变化', body));
}

// ---------------- Figure 4: sample gallery ----------------
{
  const W = 1000, H = 540, T = 78;
  const arms = [
    ['discrete', '离散因子化并行 · N=8'],
    ['flowFactor', '连续流 · 对角去噪 · N=8'],
    ['flowJoint', '连续流 · 联合去噪 · N=8'],
  ];
  const chipW = 84, chipH = 28, gap = 5, seqGap = 30;
  let body = '';
  body += text(40, 32, '同一批城市，三种拼法', 'title');
  body += text(40, 54, '每行一条 4-token 序列；蓝=第一对，橙=第二对，红框=两座城被拼坏', 'note');
  let y0 = T;
  for (const [id, label] of arms) {
    body += text(40, y0 + 8, label, 'strong');
    const seqs = R.samples[id];
    const scored = seqs.map((s) => {
      let bad = 0;
      for (let p = 0; p < 2; p++) {
        const ok = R.meta.pairs.some((d) => d.a === s[2 * p] && d.b === s[2 * p + 1]);
        if (!ok) bad++;
      }
      return { s, bad };
    });
    const chosen = [...scored].sort((a, b) => b.bad - a.bad).slice(0, 4);
    let yy = y0 + 24;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const item = chosen[r * 2 + c];
        const ox = 40 + c * (4 * chipW + 3 * gap + seqGap + 26);
        const badPair = [0, 1].map((p) => !R.meta.pairs.some((d) => d.a === item.s[2 * p] && d.b === item.s[2 * p + 1]));
        for (let i = 0; i < 4; i++) {
          const tok = item.s[i];
          const pairIdx = Math.floor(i / 2);
          const base = pairIdx === 0 ? '#e8f0ee' : '#f6ead9';
          const stroke = pairIdx === 0 ? '#9dbcba' : '#d8b98d';
          let outline = stroke, sw = 1;
          if (badPair[pairIdx]) { outline = '#c0392b'; sw = 2.4; }
          const x = ox + i * (chipW + gap);
          body += `<rect x="${x}" y="${yy}" width="${chipW}" height="${chipH}" rx="6" fill="${base}" stroke="${outline}" stroke-width="${sw}"/>`;
          body += `<text x="${x + chipW / 2}" y="${yy + 19}" text-anchor="middle" style="fill:#2a2723;font:13px ${SANS}">${esc(tok)}</text>`;
        }
        let badAny = false;
        for (let p = 0; p < 2; p++) {
          const ok = R.meta.pairs.some((d) => d.a === item.s[2 * p] && d.b === item.s[2 * p + 1]);
          if (!ok) badAny = true;
        }
        if (badAny) body += `<text x="${ox + 4 * chipW + 3 * gap + 8}" y="${yy + 19}" style="fill:#c0392b;font:700 14px ${SANS}">×</text>`;
      }
      yy += chipH + 14;
    }
    yy += 2;
    y0 = yy + 20;
  }
  // legend
  body += `<rect x="40" y="${H - 28}" width="18" height="18" rx="4" fill="#e8f0ee" stroke="#9dbcba"/>`;
  body += text(64, H - 14, '第一对', 'note');
  body += `<rect x="126" y="${H - 28}" width="18" height="18" rx="4" fill="#f6ead9" stroke="#d8b98d"/>`;
  body += text(150, H - 14, '第二对', 'note');
  body += `<rect x="212" y="${H - 28}" width="18" height="18" rx="4" fill="#fffdf8" stroke="#c0392b" stroke-width="2.4"/>`;
  body += text(236, H - 14, '非法混合（红框）', 'note');
  fs.writeFileSync(path.join(FIG, 'fig_samples.svg'), svg(W, H, '三种解码器的样本对比', body));
}

// ---------------- Figure 5: Lafa Pareto ----------------
{
  const W = 940, H = 570, L = 92, RW = 40, T = 92, B = 120;
  const PW = W - L - RW, PH = H - T - B;
  const xmax = 110, ymin = 62, ymax = 80;
  const x = (v) => L + PW * (v / xmax);
  const y = (v) => T + PH * (1 - (v - ymin) / (ymax - ymin));
  let body = '';
  body += text(L, 34, 'Lafa 7B：质量—吞吐的帕累托前沿', 'title');
  body += text(L, 58, '单张 H100、batch=1、bf16；平均 IFEval/GSM8K/HumanEval；数据来自 Lafa 论文 Table 8', 'note');
  for (let v = 62; v <= 80; v += 3) {
    body += line(L, y(v), L + PW, y(v), 'grid');
    body += text(L - 12, y(v) + 4, `${v}`, 'tick', 'end');
  }
  for (let v = 0; v <= 100; v += 20) {
    body += line(x(v), T, x(v), T + PH, 'grid');
    body += text(x(v), T + PH + 22, `${v}`, 'tick', 'middle');
  }
  body += line(L, T, L, T + PH, 'ax');
  body += line(L, T + PH, L + PW, T + PH, 'ax');
  body += text(L + PW / 2, H - 26, '吞吐（tokens/s）', 'lab', 'middle');
  body += `<g transform="translate(${L - 54},${T + PH / 2}) rotate(-90)"><text x="0" y="0" class="lab" text-anchor="middle">平均准确率（%）</text></g>`;

  const pts = [
    { name: 'AR SFT', tps: 39.5, acc: 73.9, color: '#8a8578', r: 6, dx: -12, dy: 20, anc: 'end' },
    { name: 'DeepSeek-MTP', tps: 53.6, acc: 76.3, color: '#8a8578', r: 6, dx: 12, dy: -12, anc: 'start' },
    { name: 'MARS B=4', tps: 48.4, acc: 76.1, color: '#8a8578', r: 6, dx: -12, dy: -12, anc: 'end' },
    { name: 'Fast-dLLM v2 B=16', tps: 86.7, acc: 65.1, color: '#a9764f', r: 6, dx: 12, dy: 18, anc: 'start' },
    { name: 'Lafa B=4', tps: 79.9, acc: 76.5, color: COL.joint, r: 7, dx: -12, dy: -14, anc: 'end' },
    { name: 'Lafa B=8', tps: 93.8, acc: 76.3, color: COL.joint, r: 7, dx: 12, dy: -14, anc: 'start' },
    { name: 'Lafa B=16', tps: 100.2, acc: 74.5, color: COL.joint, r: 7, dx: -12, dy: 18, anc: 'end' },
  ];
  body += line(x(39.5), T, x(39.5), T + PH, 'grid');
  for (const p of pts) body += circle(x(p.tps), y(p.acc), p.r, p.color);
  for (const p of pts) body += text(x(p.tps) + p.dx, y(p.acc) + p.dy, p.name, 'note', p.anc);
  body += text(L + 8, T + 18, '↑ 更快且不降质', 'note');
  // bracket
  const by = T + PH + 58;
  body += `<path d="M ${f1(x(39.5))} ${by} H ${f1(x(100.2))}" stroke="${COL.joint}" stroke-width="1.6" fill="none"/>`;
  body += `<path d="M ${f1(x(39.5))} ${by - 5} V ${by + 5} M ${f1(x(100.2))} ${by - 5} V ${by + 5}" stroke="${COL.joint}" stroke-width="1.6" fill="none"/>`;
  body += text((x(39.5) + x(100.2)) / 2, by + 20, '2.54× 吞吐（100.2 vs 39.5 TPS）', 'note', 'middle');
  fs.writeFileSync(path.join(FIG, 'fig_lafa.svg'), svg(W, H, 'Lafa 质量吞吐帕累托图', body));
}

console.log('figures written to', FIG);
