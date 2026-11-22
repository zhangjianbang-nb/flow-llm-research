#!/usr/bin/env node
/**
 * build_site.mjs — turns the modular Markdown report into:
 *   - REPORT.md (single Markdown file)
 *   - index.html (single-page editorial site, inline KaTeX, SVG figures)
 *
 * No external dependencies. Node 18+.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(ROOT, '..');
const REPORT_DIR = path.join(PROJECT, 'report');
const FIGS_DIR = path.join(PROJECT, 'figs');

const FILES = [
  '00_front.md',
  '01_why.md',
  '02_theory.md',
  '03_papers.md',
  '04_experiment.md',
  '05_flowgemma.md',
  '06_experiments.md',
  '07_engineering.md',
  '08_judgment.md',
  '09_reading.md',
  '10_appendix.md',
];

const read = (p) => fs.readFileSync(p, 'utf8');
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */
/* Inline markdown                                                     */
/* ------------------------------------------------------------------ */

function inline(text) {
  const math = [];
  const code = [];
  let s = text;

  // Literal dollar signs (e.g. \$2/hr) must not start math.
  s = s.replace(/\\\$/g, '\u0000D');

  // Explicit line-break markers: [[BR]] always, [[BRM]] only on mobile.
  s = s.replace(/\[\[BR\]\]/g, '\u0000B');
  s = s.replace(/\[\[BRM\]\]/g, '\u0000N');

  // Display math is handled as a block; here protect inline $...$.
  s = s.replace(/(?<!\\)\$([^$\n]+?)\$/g, (m) => {
    math.push(m);
    return `\u0000M${math.length - 1}\u0000`;
  });

  s = esc(s);
  s = s.replace(/\u0000D/g, '<span class="tex2jax_ignore">$</span>');

  s = s.replace(/`([^`]+)`/g, (m, body) => {
    code.push(body);
    return `\u0000C${code.length - 1}\u0000`;
  });

  // Bold, then italic (avoid touching bold markers).
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  // Links.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Restore code spans.
  s = s.replace(/\u0000C(\d+)\u0000/g, (m, i) => `<code>${esc(code[Number(i)])}</code>`);

  // Restore math (escaped, so KaTeX sees decoded textContent).
  s = s.replace(/\u0000M(\d+)\u0000/g, (m, i) => esc(math[Number(i)]));

  // Restore explicit line breaks.
  s = s.replace(/\u0000B/g, '<br>');
  s = s.replace(/\u0000N/g, '<br class="br-mobile">');

  return s;
}

/* ------------------------------------------------------------------ */
/* Block parser                                                        */
/* ------------------------------------------------------------------ */

const isBlockStart = (line) =>
  /^(#{2,4}\s|```|\$\$|---+\s*$|\[\[FIG:|>\s|\|)/.test(line) ||
  /^([-*]|\d+\.)\s/.test(line);

function parseBlocks(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Fenced code.
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim() || 'text';
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push({ type: 'code', lang, text: buf.join('\n') });
      continue;
    }

    // Display math.
    if (/^\$\$\s*$/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\$\$\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      blocks.push({ type: 'math', text: buf.join('\n') });
      continue;
    }

    // Headings.
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      blocks.push({ type: `h${h[1].length}`, text: h[2].trim() });
      i++;
      continue;
    }
    if (/^#\s+/.test(line)) { // top-level title is handled by the hero
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^---+\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    // Figure.
    const fig = line.match(/^\[\[FIG:([^|\]]+)\|([^\]]+)\]\]\s*$/);
    if (fig) {
      blocks.push({ type: 'figure', name: fig[1].trim(), caption: fig[2].trim() });
      i++;
      continue;
    }

    // Table.
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1])) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => {
        const t = c.trim();
        if (/^:.*:$/.test(t)) return 'center';
        if (/^.*:$/.test(t)) return 'right';
        return 'left';
      });
      const rows = [];
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ type: 'table', header, align, rows });
      continue;
    }

    // Blockquote.
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: buf.join(' ').trim() });
      continue;
    }

    // List.
    if (/^([-*]|\d+\.)\s/.test(line) || /^\s{2,}([-*]|\d+\.)\s/.test(line)) {
      const buf = [];
      while (i < lines.length && (/^([-*]|\d+\.)\s/.test(lines[i]) || /^\s{2,}([-*]|\d+\.)\s/.test(lines[i]))) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'list', items: parseListItems(buf) });
      continue;
    }

    // Paragraph.
    const buf = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'p', text: buf.join(' ') });
  }

  return blocks;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function parseListItems(lines) {
  const items = [];
  for (const l of lines) {
    const m = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (!m) continue;
    items.push({ indent: m[1].length, ordered: /^\d/.test(m[2]), text: m[3] });
  }
  // Build a simple tree: top-level items plus one nested level.
  const top = [];
  for (const it of items) {
    if (it.indent === 0) top.push({ ...it, children: [] });
    else if (top.length) top[top.length - 1].children.push(it);
  }
  return top;
}

/* ------------------------------------------------------------------ */
/* Render blocks                                                       */
/* ------------------------------------------------------------------ */

function renderList(items) {
  const ordered = items.length > 0 && items[0].ordered;
  const tag = ordered ? 'ol' : 'ul';
  let out = `<${tag}>`;
  for (const it of items) {
    out += `<li>${inline(it.text)}`;
    if (it.children && it.children.length) out += renderList(it.children);
    out += '</li>';
  }
  out += `</${tag}>`;
  return out;
}

function renderBlocks(blocks, ctx) {
  let out = '';
  let firstPara = true;

  for (const b of blocks) {
    switch (b.type) {
      case 'h2': {
        if (ctx.openSection) out += '</section>';
        ctx.chapterIndex += 1;
        ctx.sectionIndex = 0;
        ctx.subIndex = 0;
        const id = ctx.chapterIndex === 1 && ctx.isIntro ? 'intro' : `ch${ctx.chapterIndex}`;
        ctx.currentChapterId = id;
        const m = b.text.match(/^(第[一二三四五六七八九十]+章)\s+(.*)$/);
        const label = m ? m[1] : '';
        const title = m ? m[2] : b.text;
        ctx.toc.push({ level: 2, id, text: b.text, children: [] });
        out += `<section class="chapter" id="${id}" data-chapter="${ctx.chapterIndex}">`;
        out += `<header class="chapter-head">`;
        if (label) out += `<div class="chapter-label">${esc(label)}</div>`;
        out += `<h2>${inline(title)}<a class="anchor" href="#${id}" aria-label="链接到本节">#</a></h2>`;
        out += `</header>`;
        ctx.openSection = true;
        firstPara = true;
        break;
      }
      case 'h3': {
        ctx.sectionIndex += 1;
        ctx.subIndex = 0;
        const id = `${ctx.currentChapterId}-${ctx.sectionIndex}`;
        ctx.toc[ctx.toc.length - 1].children.push({ level: 3, id, text: b.text });
        out += `<h3 id="${id}">${inline(b.text)}<a class="anchor" href="#${id}" aria-label="链接到本节">#</a></h3>`;
        firstPara = true;
        break;
      }
      case 'h4': {
        ctx.subIndex += 1;
        const id = `${ctx.currentChapterId}-${ctx.sectionIndex}-${ctx.subIndex}`;
        out += `<h4 id="${id}">${inline(b.text)}<a class="anchor" href="#${id}" aria-label="链接到本节">#</a></h4>`;
        firstPara = true;
        break;
      }
      case 'p': {
        const cls = firstPara ? ' class="lede"' : '';
        out += `<p${cls}>${inline(b.text)}</p>`;
        firstPara = false;
        break;
      }
      case 'list': out += renderList(b.items); firstPara = false; break;
      case 'blockquote': {
        const isCraft = /^\*\*工匠笔记/.test(b.text);
        out += `<blockquote class="${isCraft ? 'craft-note' : 'pull-quote'}">${inline(b.text)}</blockquote>`;
        firstPara = false;
        break;
      }
      case 'table': {
        out += `<div class="table-wrap"><table><thead><tr>`;
        for (let j = 0; j < b.header.length; j++) {
          out += `<th style="text-align:${b.align[j] || 'left'}">${inline(b.header[j])}</th>`;
        }
        out += `</tr></thead><tbody>`;
        for (const row of b.rows) {
          out += `<tr>`;
          for (let j = 0; j < b.header.length; j++) {
            out += `<td style="text-align:${b.align[j] || 'left'}">${inline(row[j] ?? '')}</td>`;
          }
          out += `</tr>`;
        }
        out += `</tbody></table></div>`;
        firstPara = false;
        break;
      }
      case 'code':
        out += `<div class="code-block"><div class="code-head"><span>${esc(b.lang)}</span><button class="copy-btn" type="button">复制</button></div><pre><code class="language-${esc(b.lang)}">${esc(b.text)}</code></pre></div>`;
        firstPara = false;
        break;
      case 'math':
        out += `<div class="math-display">$$${esc(b.text)}$$</div>`;
        firstPara = false;
        break;
      case 'figure':
        out += `<figure class="figure" id="fig-${esc(b.name)}"><div class="fig-frame"><img src="figs/${esc(b.name)}.svg" alt="${esc(b.caption)}"></div><figcaption>${inline(b.caption)}</figcaption></figure>`;
        firstPara = false;
        break;
      case 'hr':
        out += `<hr class="section-rule">`;
        firstPara = true;
        break;
    }
  }

  if (ctx.openSection) out += '</section>';
  return out;
}

/* ------------------------------------------------------------------ */
/* Front matter                                                        */
/* ------------------------------------------------------------------ */

function parseFront(raw) {
  const title = (raw.match(/^#\s+(.+)$/m) || [])[1] || '从 DiffusionGemma 到 FlowGemma';
  const subtitle = (raw.match(/^##\s+(.+)$/m) || [])[1] || '';
  const meta = (raw.match(/^>\s+(.+)$/m) || [])[1] || '';
  const lead = (raw.match(/^\*\*一句话结论：(.*)\*\*\s*$/m) || [])[1] || '';
  const idx = raw.indexOf('\n---\n', raw.indexOf(lead));
  const body = idx >= 0 ? raw.slice(idx + 5) : raw;
  return { title, subtitle, meta, lead, body };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const front = parseFront(read(path.join(REPORT_DIR, '00_front.md')));
const chapterFiles = FILES.slice(1);

let article = '';
const toc = [];

// Intro (front body): synthetic chapter heading "导读".
{
  const blocks = parseBlocks(front.body);
  const ctx = {
    chapterIndex: 0, sectionIndex: 0, subIndex: 0,
    currentChapterId: 'intro', openSection: false, toc, isIntro: true,
  };
  // Inject a synthetic h2 so the intro gets a section wrapper and TOC parent.
  blocks.unshift({ type: 'h2', text: '导读' });
  // The h2 branch will create id "intro" because chapterIndex becomes 1 and isIntro.
  article += renderBlocks(blocks, ctx);
}

for (const file of chapterFiles) {
  const raw = read(path.join(REPORT_DIR, file)).replace(/\n---\s*$/, '');
  const blocks = parseBlocks(raw);
  const ctx = {
    chapterIndex: toc.filter((t) => t.level === 2).length - 1, // intro is not a chapter
    sectionIndex: 0, subIndex: 0,
    currentChapterId: '', openSection: false, toc, isIntro: false,
  };
  article += renderBlocks(blocks, ctx);
}

// REPORT.md — single file.
const reportMd = [
  read(path.join(REPORT_DIR, '00_front.md')).trim(),
  ...chapterFiles.map((f) => read(path.join(REPORT_DIR, f)).trim()),
].join('\n\n');
fs.writeFileSync(path.join(PROJECT, 'REPORT.md'), reportMd.replace(/\[\[BRM?\]\]/g, ' ') + '\n');

// Stats.
const cjk = (reportMd.match(/[\u3400-\u9fff]/g) || []).length;
const figCount = (reportMd.match(/\[\[FIG:/g) || []).length;
const tableCount = (reportMd.match(/^\|[-: |]+\|$/gm) || []).length;
const paperCount = (reportMd.match(/arXiv:\d{4}\.\d{4,5}/g) || []).length;

// TOC HTML.
function renderToc(items) {
  let out = '<ol class="toc-list">';
  for (const it of items) {
    out += `<li class="toc-item"><a href="#${it.id}" class="toc-link">${esc(it.text.replace(/\[\[BRM?\]\]/g, ' '))}</a>`;
    if (it.children && it.children.length) {
      out += '<ol class="toc-sub">';
      for (const c of it.children) {
        out += `<li><a href="#${c.id}" class="toc-sublink">${esc(c.text.replace(/\[\[BRM?\]\]/g, ' '))}</a></li>`;
      }
      out += '</ol>';
    }
    out += '</li>';
  }
  out += '</ol>';
  return out;
}

const tocHtml = renderToc(toc);

const heroRiver = `
<svg class="hero-river" viewBox="0 0 560 420" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="riverA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".15"/>
      <stop offset="1" stop-color="var(--accent)" stop-opacity=".75"/>
    </linearGradient>
    <linearGradient id="riverB" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--accent-2)" stop-opacity=".1"/>
      <stop offset="1" stop-color="var(--accent-2)" stop-opacity=".55"/>
    </linearGradient>
  </defs>
  <path d="M -30 110 C 80 60, 180 180, 300 120 S 470 40, 590 96" stroke="url(#riverA)" stroke-width="2.4" class="river-line"/>
  <path d="M -30 168 C 90 120, 200 236, 320 176 S 480 96, 590 152" stroke="url(#riverA)" stroke-width="1.4" opacity=".55" class="river-line river-line-2"/>
  <path d="M -30 232 C 100 184, 210 300, 330 240 S 490 160, 590 216" stroke="url(#riverB)" stroke-width="1" opacity=".5" class="river-line river-line-3"/>
  <g class="river-dots">
    <circle cx="76" cy="92" r="3.2" fill="var(--accent)"/>
    <circle cx="148" cy="126" r="3.2" fill="var(--accent)"/>
    <circle cx="226" cy="138" r="3.2" fill="var(--accent)"/>
    <circle cx="310" cy="120" r="3.2" fill="var(--accent)"/>
    <circle cx="392" cy="78" r="3.2" fill="var(--accent)"/>
    <circle cx="474" cy="62" r="3.2" fill="var(--accent)"/>
    <circle cx="536" cy="78" r="3.2" fill="var(--accent)"/>
  </g>
  <text x="34" y="300" class="river-label">噪声</text>
  <text x="486" y="300" class="river-label">token</text>
  <path d="M 92 306 C 220 320, 380 320, 500 306" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5" opacity=".7"/>
  <text x="34" y="352" class="river-caption">一条河，三种走法</text>
  <text x="34" y="374" class="river-caption-sub">AR 逐滴 · Diffusion 擦补 · Flow 联合</text>
</svg>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(front.title)} · ${esc(front.subtitle)}</title>
<meta name="description" content="${esc(front.lead)}">
<meta name="author" content="张建邦">
<meta property="og:title" content="${esc(front.title)}">
<meta property="og:description" content="${esc(front.lead)}">
<meta property="og:type" content="article">
<link rel="stylesheet" href="assets/katex/katex.min.css">
<link rel="stylesheet" href="assets/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%231f6f68'/><path d='M4 20 C 10 14, 16 24, 22 17 S 28 12, 30 15' stroke='%23f6f1e7' stroke-width='2.2' fill='none'/></svg>">
</head>
<body>
<div class="progress" id="progress"><span></span></div>

<header class="site-head">
  <a class="brand" href="#top">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 28 28" fill="none"><path d="M3 18 C 8 12, 12 21, 17 15 S 24 10, 26 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </span>
    <span class="brand-text">FlowGemma <em>调研</em></span>
  </a>
  <nav class="head-nav" aria-label="页面导航">
    <a href="#ch1">为什么</a>
    <a href="#ch4">实验</a>
    <a href="#ch5">架构</a>
    <a href="#ch8">判断</a>
    <a href="#ch9">阅读</a>
  </nav>
  <div class="head-actions">
    <button class="icon-btn" id="tocToggle" type="button" aria-label="打开目录" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    <button class="icon-btn" id="themeToggle" type="button" aria-label="切换深色模式">
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none"><path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
    </button>
    <button class="tts-launch" id="ttsLaunch" type="button" aria-label="打开朗读面板">
      <svg viewBox="0 0 24 24" fill="none"><path d="M4 10v4h3l4 3V7l-4 3H4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      <span>朗读</span>
    </button>
  </div>
</header>

<main id="top">
  <section class="hero">
    <div class="hero-inner">
      <div class="hero-copy">
        <div class="eyebrow">技术调研 · 2026 年 11 月</div>
        <h1>${esc(front.title)}</h1>
        <p class="hero-sub">${esc(front.subtitle)}</p>
        <div class="hero-meta">${esc(front.meta)}</div>
        <div class="hero-lead">
          <span class="lead-label">一句话结论</span>
          <p>${inline(front.lead)}</p>
        </div>
        <div class="hero-stats">
          <div><b>${tableCount}</b><span>张表</span></div>
          <div><b>${figCount}</b><span>张图</span></div>
          <div><b>${paperCount}</b><span>处论文引用</span></div>
          <div><b>${Math.round(cjk / 1000)}k</b><span>汉字</span></div>
        </div>
        <a class="scroll-cue" href="#intro">开始阅读 <span aria-hidden="true">↓</span></a>
      </div>
      <div class="hero-art">${heroRiver}</div>
    </div>
  </section>

  <div class="layout">
    <aside class="toc-wrap" id="tocWrap" aria-label="目录">
      <div class="toc-head">
        <span>目录</span>
        <button class="toc-close" id="tocClose" type="button" aria-label="关闭目录">×</button>
      </div>
      <nav class="toc">${tocHtml}</nav>
      <div class="toc-foot">
        <a href="REPORT.md">Markdown 全文</a>
        <a href="report.pdf">PDF</a>
        <a href="https://github.com/zhangjianbang-nb/flow-llm-research" target="_blank" rel="noopener">GitHub</a>
      </div>
    </aside>

    <article class="article" id="article">
${article}
    </article>
  </div>

  <footer class="site-foot">
    <div class="foot-mark" aria-hidden="true">≈</div>
    <p>从 DiffusionGemma 到 FlowGemma</p>
    <p class="foot-sub">2026-11-21 · 张建邦 主持调研 · ZCode 执行论文核验、独立实验与撰写</p>
    <p class="foot-sub">文本 ${cjk.toLocaleString('zh-CN')} 汉字 · ${figCount} 张图 · ${tableCount} 张表 · ${paperCount} 处论文引用</p>
    <p class="foot-sub foot-links"><a href="REPORT.md">Markdown</a> · <a href="report.pdf">PDF</a> · <a href="https://github.com/zhangjianbang-nb/flow-llm-research" target="_blank" rel="noopener">GitHub</a></p>
  </footer>
</main>

<button class="to-top" id="toTop" type="button" aria-label="回到顶部">↑</button>

<!-- TTS panel -->
<section class="tts-panel" id="ttsPanel" aria-label="朗读控制" aria-hidden="true">
  <div class="tts-head">
    <div class="tts-title">
      <span class="tts-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <span>朗读</span>
    </div>
    <button class="tts-close" id="ttsClose" type="button" aria-label="收起朗读面板">×</button>
  </div>
  <div class="tts-body">
    <div class="tts-row tts-transport">
      <button class="tts-play" id="ttsPlay" type="button" aria-label="播放">
        <svg class="ic-play" viewBox="0 0 24 24" fill="none"><path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor"/></svg>
        <svg class="ic-pause" viewBox="0 0 24 24" fill="none"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>
      </button>
      <button class="tts-stop" id="ttsStop" type="button" aria-label="停止">
        <svg viewBox="0 0 24 24" fill="none"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>
      </button>
      <button class="tts-mute" id="ttsMute" type="button" aria-label="静音" aria-pressed="false">
        <svg class="ic-vol" viewBox="0 0 24 24" fill="none"><path d="M4 10v4h3l4 3V7l-4 3H4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14.5 9.5a4 4 0 0 1 0 5M17 7a7.5 7.5 0 0 1 0 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <svg class="ic-muted" viewBox="0 0 24 24" fill="none"><path d="M4 10v4h3l4 3V7l-4 3H4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m15 10 4 4m0-4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      </button>
      <span class="tts-status" id="ttsStatus">未开始</span>
    </div>
    <label class="tts-slider">
      <span>音量</span>
      <input type="range" id="ttsVolume" min="0" max="100" value="90" aria-label="朗读音量">
      <output id="ttsVolumeOut">90%</output>
    </label>
    <label class="tts-slider">
      <span>语速</span>
      <input type="range" id="ttsRate" min="60" max="180" value="100" aria-label="朗读语速">
      <output id="ttsRateOut">1.0×</output>
    </label>
    <label class="tts-select">
      <span>声音</span>
      <select id="ttsVoice" aria-label="选择朗读声音">
        <option value="">自动（中文）</option>
      </select>
    </label>
    <div class="tts-hint">从当前屏幕位置开始朗读；再次点击播放可暂停/继续。</div>
  </div>
</section>

<div class="lightbox" id="lightbox" aria-hidden="true">
  <button class="lightbox-close" id="lightboxClose" type="button" aria-label="关闭大图">×</button>
  <img id="lightboxImg" alt="">
</div>

<script src="assets/katex/katex.min.js"></script>
<script src="assets/katex/contrib/auto-render.min.js"></script>
<script src="assets/app.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(PROJECT, 'index.html'), html);

console.log(`built index.html — ${cjk.toLocaleString('zh-CN')} 汉字, ${figCount} 图, ${tableCount} 表, ${paperCount} 引用`);
console.log(`built REPORT.md — ${(reportMd.length / 1024).toFixed(1)} KB`);
