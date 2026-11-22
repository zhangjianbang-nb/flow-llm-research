#!/usr/bin/env node
/** Hand-authored explanatory diagrams (SVG) for the report. */
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FIG = path.join(HERE, '..', 'figs');
fs.mkdirSync(FIG, { recursive: true });

const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif";
const SERIF = "'Songti SC','Noto Serif SC',Georgia,serif";
const C = {
  ink: '#2a2723',
  muted: '#6f6a60',
  teal: '#1f6f68',
  terra: '#c05a3e',
  gold: '#b8892f',
  slate: '#5b6b7c',
  tealFill: '#e8f0ee',
  terraFill: '#f6ead9',
  goldFill: '#f3ecd9',
  slateFill: '#e9edf1',
  line: '#cfc8b8',
  paper: '#f7f3ea',
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(w, h, title, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="${C.muted}"/>
  </marker>
  <marker id="arrT" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="${C.teal}"/>
  </marker>
  ${defs}
</defs>
<style>
  .t{fill:${C.ink};font-family:${SANS}}
  .muted{fill:${C.muted};font-family:${SANS}}
  .serif{fill:${C.ink};font-family:${SERIF}}
  .mono{fill:${C.ink};font-family:'SF Mono',Menlo,monospace}
</style>
${body}
</svg>`;
}
function box(x, y, w, h, title, sub = '', fill = '#fffdf8', stroke = C.line, ts = 14, ss = 11) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;
  s += `<text x="${x + w / 2}" y="${y + (sub ? h / 2 - 4 : h / 2 + 5)}" text-anchor="middle" class="t" style="font-size:${ts}px;font-weight:600">${esc(title)}</text>`;
  if (sub) s += `<text x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle" class="muted" style="font-size:${ss}px">${esc(sub)}</text>`;
  return s;
}
function arrow(x1, y1, x2, y2, color = C.muted, dash = '', marker = 'arr') {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="1.6" fill="none"${dash ? ` stroke-dasharray="${dash}"` : ''} marker-end="url(#${marker})"/>`;
}
function label(x, y, s, size = 12, color = C.muted, anchor = 'start', weight = 400) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" style="fill:${color};font-family:${SANS};font-size:${size}px;font-weight:${weight}">${esc(s)}</text>`;
}
function title(x, y, s, size = 20) {
  return `<text x="${x}" y="${y}" class="serif" style="font-size:${size}px;font-weight:600">${esc(s)}</text>`;
}
function subtitle(x, y, s) {
  return `<text x="${x}" y="${y}" class="muted" style="font-size:12.5px">${esc(s)}</text>`;
}

// ---------------- Figure: three generations ----------------
{
  const W = 1020, H = 560;
  let b = '';
  b += title(40, 36, '三代生成范式：写、擦、流');
  b += subtitle(40, 60, '同一个目标——把「一次一个 token」变成「一次一块 token」；差别在于块内如何消解不确定性');
  const cols = [
    { x: 40, w: 300, title: 'AR：逐字写', color: C.slate, fill: C.slateFill },
    { x: 360, w: 300, title: 'DiffusionGemma：整块擦', color: C.terra, fill: C.terraFill },
    { x: 680, w: 300, title: 'FlowGemma：整块流', color: C.teal, fill: C.tealFill },
  ];
  for (const col of cols) {
    b += `<rect x="${col.x}" y="86" width="${col.w}" height="400" rx="12" fill="${col.fill}" stroke="${col.color}" stroke-width="1.4"/>`;
    b += label(col.x + col.w / 2, 116, col.title, 15, col.color, 'middle', 600);
  }
  // AR
  {
    const x = 40, y = 140;
    const words = ['今天', '河流', '把', '墨', '送', '到'];
    words.forEach((w, i) => {
      b += `<rect x="${x + 90}" y="${y + i * 44}" width="120" height="32" rx="6" fill="#fffdf8" stroke="${i === 3 ? C.teal : C.line}" stroke-width="${i === 3 ? 2 : 1}"/>`;
      b += label(x + 150, y + i * 44 + 21, w, 13, C.ink, 'middle');
      if (i < words.length - 1) b += arrow(x + 150, y + i * 44 + 32, x + 150, y + i * 44 + 44, C.muted);
    });
    b += label(x + 150, y + 6 * 44 + 10, '每 forward 只提交 1 个 token', 11.5, C.muted, 'middle');
    b += label(x + 150, y + 6 * 44 + 28, 'O(L) 次串行前向', 11.5, C.muted, 'middle');
  }
  // DiffusionGemma
  {
    const x = 360, y = 140;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const filled = (r * 6 + c) % 3 !== 0;
        b += `<rect x="${x + 30 + c * 40}" y="${y + r * 36}" width="32" height="26" rx="4" fill="${filled ? '#fffdf8' : '#d9c9b8'}" stroke="${C.terra}" stroke-width="0.9" opacity="${filled ? 1 : 0.7}"/>`;
      }
    }
    b += label(x + 150, y + 6 * 36 + 12, '256-token 画布，块内双向', 11.5, C.muted, 'middle');
    b += label(x + 150, y + 6 * 36 + 30, '最多 N=48 步去噪，平均约 12 步', 11.5, C.muted, 'middle');
    b += label(x + 150, y + 6 * 36 + 48, '块间因果，前缀可 KV cache', 11.5, C.muted, 'middle');
  }
  // FlowGemma
  {
    const x = 680, y = 140;
    for (let i = 0; i < 6; i++) {
      b += `<circle cx="${x + 50}" cy="${y + 20 + i * 34}" r="9" fill="#dfe8e5" stroke="${C.teal}" stroke-width="1"/>`;
    }
    for (let i = 0; i < 6; i++) {
      b += `<rect x="${x + 200}" y="${y + 8 + i * 34}" width="70" height="26" rx="5" fill="#fffdf8" stroke="${C.teal}" stroke-width="1"/>`;
    }
    for (let i = 0; i < 6; i++) {
      const y1 = y + 20 + i * 34, y2 = y + 21 + i * 34;
      b += `<path d="M ${x + 62} ${y1} C ${x + 120} ${y1}, ${x + 140} ${y2}, ${x + 196} ${y2}" stroke="${C.teal}" stroke-width="1.2" fill="none" opacity=".7"/>`;
    }
    b += label(x + 50, y + 2, '噪声', 11.5, C.muted, 'middle');
    b += label(x + 235, y + 2, '词嵌入 → token', 11.5, C.muted, 'middle');
    b += label(x + 150, y + 6 * 36 + 30, '块大小 B=16，K=1–4 步', 11.5, C.muted, 'middle');
    b += label(x + 150, y + 6 * 36 + 48, '连续速度场联合传输整块', 11.5, C.muted, 'middle');
    b += label(x + 150, y + 6 * 36 + 66, '前缀 KV cache 跨步复用', 11.5, C.muted, 'middle');
  }
  // bottom band
  b += `<rect x="40" y="502" width="940" height="40" rx="10" fill="${C.goldFill}" stroke="${C.gold}" stroke-width="1"/>`;
  b += label(510, 527, '共同目标：块级并行提交 + 因果前缀 + 用 AR 能力验证草稿', 13, C.ink, 'middle', 600);
  fs.writeFileSync(path.join(FIG, 'fig_generations.svg'), svg(W, H, '三代生成范式', b));
}

// ---------------- Figure: FlowGemma architecture ----------------
{
  const W = 1140, H = 710;
  let b = '';
  b += title(40, 36, 'FlowGemma 提案：MoE 骨干上的块级连续流');
  b += subtitle(40, 60, '左侧训练架构，右侧推理循环；虚线表示块间循环');
  // left panel
  b += `<rect x="30" y="84" width="760" height="610" rx="14" fill="#fffdf8" stroke="${C.line}"/>`;
  b += label(50, 112, '训练时：一个骨干，两个头', 14, C.ink, 'start', 600);
  // prefix tokens + embedding
  b += box(50, 130, 150, 56, '前缀 tokens', 'c ∈ V^N', '#fffdf8', C.slate);
  b += box(240, 130, 180, 56, '共享词嵌入 E', '范数冻结，只学方向', C.slateFill, C.slate);
  b += arrow(200, 158, 238, 158);
  // noisy block
  b += box(50, 220, 150, 56, '噪声块 x_t', 'x_t ∈ R^{B×d}', C.tealFill, C.teal);
  b += box(50, 300, 150, 56, 'token 时间 τ(t)', 'adaLN 条件', C.tealFill, C.teal);
  b += box(50, 380, 150, 56, '前缀 KV cache', '与块状态无关', C.goldFill, C.gold);
  // MoE
  b += `<rect x="240" y="210" width="360" height="250" rx="12" fill="#fffdf8" stroke="${C.teal}" stroke-width="1.6"/>`;
  b += label(420, 236, 'MoE Transformer × L', 15, C.teal, 'middle', 600);
  b += label(420, 256, 'Router top-2 · 128 experts', 11.5, C.muted, 'middle');
  // experts
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 8; c++) {
      b += `<circle cx="${280 + c * 38}" cy="${282 + r * 26}" r="8" fill="${(r + c) % 3 === 0 ? C.goldFill : C.tealFill}" stroke="${C.teal}" stroke-width="1"/>`;
    }
  }
  // attention masks
  b += label(270, 350, '注意力掩码', 11.5, C.muted);
  b += `<rect x="270" y="360" width="120" height="70" rx="6" fill="#fffdf8" stroke="${C.slate}"/>`;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const causal = c <= r;
    b += `<rect x="${278 + c * 26}" y="${368 + r * 15}" width="22" height="11" rx="2" fill="${causal ? C.slateFill : '#fffdf8'}" stroke="${C.slate}" stroke-width=".7"/>`;
  }
  b += label(330, 445, '前缀：因果', 10.5, C.slate, 'middle');
  b += `<rect x="420" y="360" width="120" height="70" rx="6" fill="#fffdf8" stroke="${C.teal}"/>`;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    b += `<rect x="${428 + c * 26}" y="${368 + r * 15}" width="22" height="11" rx="2" fill="${C.tealFill}" stroke="${C.teal}" stroke-width=".7"/>`;
  }
  b += label(480, 445, '块内：双向', 10.5, C.teal, 'middle');
  // arrows into MoE
  b += arrow(200, 158, 238, 250, C.slate);
  b += arrow(200, 248, 238, 280, C.teal);
  b += arrow(200, 328, 238, 310, C.teal);
  b += arrow(200, 408, 238, 400, C.gold);
  // heads
  b += box(650, 220, 120, 62, 'AR head', '预测 c^{i+1}', C.slateFill, C.slate);
  b += box(650, 310, 120, 62, 'Flow 头 D_t', '每位置词表分布', C.tealFill, C.teal);
  b += arrow(600, 250, 648, 250, C.slate);
  b += arrow(600, 340, 648, 340, C.teal);
  // losses
  b += `<rect x="50" y="480" width="720" height="80" rx="10" fill="${C.goldFill}" stroke="${C.gold}"/>`;
  b += label(410, 505, '联合训练目标', 13, C.ink, 'middle', 600);
  b += label(410, 528, 'L = CE_AR(prefix) + CE_denoise(block) + λ·MSE(E·D_t, E_y) + μ·KL(flow-map)', 11.5, C.ink, 'middle');
  b += label(410, 548, 'AR 损失保留预训练能力；去噪损失学联合速度；flow-map KL 把多步压成少步', 10.5, C.muted, 'middle');
  b += label(50, 610, '三个不可省略的选择：', 12, C.ink, 'start', 600);
  b += label(50, 632, '① 块内双向注意力：让后面的 token 也能纠正前面的 token', 11.5, C.muted);
  b += label(50, 650, '② 异步 token 时间：让靠左的 token 先走，匹配文本的方向性', 11.5, C.muted);
  b += label(50, 668, '③ 前缀 KV 与块状态解耦：跨去噪步、跨块复用，才有吞吐收益', 11.5, C.muted);
  // right panel inference
  b += `<rect x="810" y="84" width="300" height="610" rx="14" fill="${C.tealFill}" stroke="${C.teal}"/>`;
  b += label(960, 112, '推理时：块级并行 + AR 验证', 14, C.teal, 'middle', 600);
  const steps = [
    ['x₀ ~ N(0, σ²I)', '整块噪声'],
    ['K 步 Euler / 一步 FlowMap', '连续传输到词嵌入'],
    ['草稿块 ŷ（B tokens）', '每位置 argmax'],
    ['AR 验证器（同一模型）', '最长通过前缀 a'],
    ['提交 a 个 token', '追加 KV cache'],
    ['下一块', '前缀增长，循环'],
  ];
  let sy = 140;
  steps.forEach(([t, s], i) => {
    b += box(830, sy, 260, 58, t, s, '#fffdf8', i === 1 ? C.teal : C.line, 13, 10.5);
    if (i < steps.length - 1) b += arrow(960, sy + 58, 960, sy + 76, C.teal, '', 'arrT');
    sy += 76;
  });
  // side notes
  b += label(830, 610, 'TPF ≈ 接受长度 a', 11, C.muted);
  b += label(830, 628, 'KV 复用：前缀 K/V 与块状态无关', 11, C.muted);
  b += label(830, 646, '质量优先：a 小则回退 1 token 或加 NFE', 11, C.muted);
  b += label(830, 664, '吞吐优先：一步 FlowMap + 置信阈值', 11, C.muted);
  // feedback dashed
  b += arrow(1092, 578, 1092, 150, C.teal, '5 5', 'arrT');
  fs.writeFileSync(path.join(FIG, 'fig_arch.svg'), svg(W, H, 'FlowGemma 架构提案', b));
}

// ---------------- Figure: taxonomy matrix ----------------
{
  const W = 940, H = 620;
  let b = '';
  b += title(40, 36, '把「流」放回地图：状态空间 × 块内耦合');
  b += subtitle(40, 60, '横轴是状态空间，纵轴是块内是否联合建模；位置是示意，不是严格互斥的分类');
  const x0 = 150, y0 = 110, w = 640, h = 420;
  b += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="12" fill="#fffdf8" stroke="${C.line}"/>`;
  b += `<line x1="${x0 + w / 2}" y1="${y0}" x2="${x0 + w / 2}" y2="${y0 + h}" stroke="${C.line}" stroke-width="1" stroke-dasharray="5 5"/>`;
  b += `<line x1="${x0}" y1="${y0 + h / 2}" x2="${x0 + w}" y2="${y0 + h / 2}" stroke="${C.line}" stroke-width="1" stroke-dasharray="5 5"/>`;
  b += label(x0 + w / 2, y0 - 16, '离散状态（one-hot / 硬提交）', 12, C.terra, 'middle', 600);
  b += label(x0 + w / 2, y0 + h + 28, '连续状态（embedding / 软传输）', 12, C.teal, 'middle', 600);
  b += `<text x="${x0 - 18}" y="${y0 + h / 4}" text-anchor="middle" transform="rotate(-90 ${x0 - 18} ${y0 + h / 4})" style="fill:${C.slate};font-family:${SANS};font-size:12px;font-weight:600">因子化（各位置独立）</text>`;
  b += `<text x="${x0 - 18}" y="${y0 + 3 * h / 4}" text-anchor="middle" transform="rotate(-90 ${x0 - 18} ${y0 + 3 * h / 4})" style="fill:${C.teal};font-family:${SANS};font-size:12px;font-weight:600">联合（看整块）</text>`;

  function chips(cx, cy, items, color, fill) {
    let s = '';
    items.forEach((it, i) => {
      const yy = cy + i * 34;
      s += `<rect x="${cx - 150}" y="${yy - 16}" width="300" height="26" rx="6" fill="${fill}" stroke="${color}" stroke-width="1"/>`;
      s += label(cx, yy + 2, it, 11.5, C.ink, 'middle');
    });
    return s;
  }
  // quadrants
  b += label(x0 + w / 4, y0 + 30, '离散 + 因子化', 12, C.terra, 'middle', 600);
  b += chips(x0 + w / 4, y0 + 66, ['MDLM / Dream / LLaDA', 'DiffusionGemma（块内因子化）', 'FS-DFM（step-aware）', 'Logit-KL / 一般离散路径'], C.terra, C.terraFill);
  b += label(x0 + 3 * w / 4, y0 + 30, '离散 + 联合（少量）', 12, C.gold, 'middle', 600);
  b += chips(x0 + 3 * w / 4, y0 + 66, ['Transition Matching（统一框架）'], C.gold, C.goldFill);
  b += label(x0 + 3 * w / 4, y0 + 112, '离散流的联合后验仍少见；', 10.5, C.muted, 'middle');
  b += label(x0 + 3 * w / 4, y0 + 130, '多数实现按位置因子化。', 10.5, C.muted, 'middle');
  b += label(x0 + w / 4, y0 + h / 2 + 30, '连续 + 因子化', 12, C.slate, 'middle', 600);
  b += chips(x0 + w / 4, y0 + h / 2 + 66, ['对角流（本报告 toy 对照）', '逐位置独立去噪'], C.slate, C.slateFill);
  b += label(x0 + 3 * w / 4, y0 + h / 2 + 8, '★ 本报告主张：连续 + 联合', 12, C.teal, 'middle', 600);
  b += label(x0 + 3 * w / 4, y0 + h / 2 + 32, '连续 + 联合', 12, C.teal, 'middle', 600);
  b += chips(x0 + 3 * w / 4, y0 + h / 2 + 68, ['FMLM / FMLM⁺', 'Lafa（block-bidirectional）', 'LangFlow / RePlaid', 'FlowGemma（本报告提案）'], C.teal, C.tealFill);
  b += `<rect x="40" y="560" width="860" height="38" rx="9" fill="${C.goldFill}" stroke="${C.gold}"/>`;
  b += label(470, 584, '注意：连续不等于联合；只把状态变连续、却仍逐位置独立去噪，会得到「自信的错」（见玩具实验）。', 11.5, C.ink, 'middle');
  fs.writeFileSync(path.join(FIG, 'fig_matrix.svg'), svg(W, H, '流语言模型分类地图', b));
}

// ---------------- Figure: roadmap ----------------
{
  const W = 1000, H = 440;
  let b = '';
  b += title(40, 36, '一条可执行的 24 个月路线');
  b += subtitle(40, 60, '每阶段都有明确的 Go/No-Go 门槛；不达标就转向离散流、MTP 或混合 AR，而不是硬扛');
  const phases = [
    { x: 50, w: 280, title: 'E1 · 0–6 月', sub: '0.5B 稠密对照', color: C.teal, fill: C.tealFill,
      lines: ['4 个去噪器臂：离散 / 对角 / 联合 / 异步', '20B tokens，块 4/8/16', '指标：Gen PPL、IFEval/GSM8K/HumanEval', '诊断：非法混合率、TPF、显存'],
      gate: '门槛：N≤4 时联合比对角高 ≥5 分' },
    { x: 360, w: 280, title: 'E2 · 6–12 月', sub: '8B MoE 流适配', color: C.gold, fill: C.goldFill,
      lines: ['8B total / 2B active，30B tokens', '从 AR 检查点适配，块 16/32', '对照：AR SFT、MTP、离散扩散、Lafa', '指标：质量、TPS、batch 1/8/32'],
      gate: '门槛：质量 ≥ AR−1.5，TPS ≥2×' },
    { x: 670, w: 280, title: 'E3 · 12–24 月', sub: '少步 + 自投机', color: C.terra, fill: C.terraFill,
      lines: ['FlowMap 蒸馏到 1–2 步', 'AR 验证器 + 置信回退', '长上下文 32K、多模态接口', '指标：接受率、TPF、p99、$/1M tok'],
      gate: '门槛：接受率 ≥70%，TPS ≥2.5×' },
  ];
  for (const p of phases) {
    b += `<rect x="${p.x}" y="90" width="${p.w}" height="270" rx="12" fill="${p.fill}" stroke="${p.color}" stroke-width="1.5"/>`;
    b += label(p.x + 18, 120, p.title, 15, p.color, 'start', 600);
    b += label(p.x + 18, 142, p.sub, 11.5, C.muted);
    p.lines.forEach((line, i) => {
      b += label(p.x + 18, 174 + i * 28, '· ' + line, 11.5, C.ink);
    });
    b += `<rect x="${p.x + 18}" y="${290}" width="${p.w - 36}" height="44" rx="8" fill="#fffdf8" stroke="${p.color}" stroke-width="1"/>`;
    b += label(p.x + p.w / 2, 310, p.gate, 10.5, p.color, 'middle', 600);
    b += label(p.x + p.w / 2, 326, '不达标 → 止损/转向', 10, C.muted, 'middle');
  }
  // arrows
  b += arrow(330, 220, 358, 220, C.muted);
  b += arrow(640, 220, 668, 220, C.muted);
  // bottom
  b += `<rect x="50" y="386" width="900" height="34" rx="8" fill="${C.slateFill}" stroke="${C.slate}"/>`;
  b += label(500, 408, '并行工程线：KV cache 布局、adaLN 融合、专家并行 all-to-all、投机验证融合内核', 11.5, C.slate, 'middle', 600);
  fs.writeFileSync(path.join(FIG, 'fig_roadmap.svg'), svg(W, H, 'FlowGemma 研究路线图', b));
}

console.log('diagrams written to', FIG);
