/* ------------------------------------------------------------------ */
/* FlowGemma 调研 · interactions                                        */
/* ------------------------------------------------------------------ */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const header = $('.site-head');
  const article = $('#article');
  const docEl = document.documentElement;

  /* Theme ----------------------------------------------------------- */
  const themeToggle = $('#themeToggle');
  const params = new URLSearchParams(window.location.search);
  const themeParam = params.get('theme');
  const storedTheme = localStorage.getItem('flow-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (themeParam === 'light' || themeParam === 'dark') docEl.setAttribute('data-theme', themeParam);
  else if (storedTheme) docEl.setAttribute('data-theme', storedTheme);
  else if (prefersDark) docEl.setAttribute('data-theme', 'dark');

  function updateThemeLabel() {
    const dark = docEl.getAttribute('data-theme') === 'dark';
    themeToggle.setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
  }
  updateThemeLabel();

  themeToggle.addEventListener('click', () => {
    const next = docEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    docEl.setAttribute('data-theme', next);
    localStorage.setItem('flow-theme', next);
    updateThemeLabel();
  });

  /* Progress + to-top ----------------------------------------------- */
  const progressBar = $('#progress span');
  const toTop = $('#toTop');
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = docEl.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      progressBar.style.width = pct.toFixed(2) + '%';
      toTop.classList.toggle('show', window.scrollY > 700);
      updateActiveToc();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* TOC -------------------------------------------------------------- */
  const tocWrap = $('#tocWrap');
  const tocToggle = $('#tocToggle');
  const tocClose = $('#tocClose');

  function openToc() {
    tocWrap.classList.add('open');
    tocToggle.setAttribute('aria-expanded', 'true');
  }
  function closeToc() {
    tocWrap.classList.remove('open');
    tocToggle.setAttribute('aria-expanded', 'false');
  }
  tocToggle.addEventListener('click', () => {
    tocWrap.classList.contains('open') ? closeToc() : openToc();
  });
  tocClose.addEventListener('click', closeToc);

  $$('.toc a').forEach((a) => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 980) closeToc();
    });
  });

  const tocLinks = $$('.toc-link');
  const tocSubLinks = $$('.toc-sublink');
  const headings = $$('.article .chapter, .article h3[id]');

  function updateActiveToc() {
    if (!headings.length) return;
    const offset = (header ? header.offsetHeight : 60) + 56;
    let current = headings[0];
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= offset) current = h;
      else break;
    }
    const id = current.id;
    tocLinks.forEach((a) => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', on);
      const item = a.closest('.toc-item');
      if (item) item.classList.toggle('active', on || !!item.querySelector('.toc-sublink.active'));
    });
    tocSubLinks.forEach((a) => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', on);
      if (on) {
        const item = a.closest('.toc-item');
        if (item) item.classList.add('active');
      }
    });
  }

  /* Lightbox --------------------------------------------------------- */
  const lightbox = $('#lightbox');
  const lightboxImg = $('#lightboxImg');
  const lightboxClose = $('#lightboxClose');

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  $$('.figure img').forEach((img) => {
    img.addEventListener('click', () => openLightbox(img.src, img.alt));
  });
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  /* Copy code -------------------------------------------------------- */
  $$('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.code-block').querySelector('code');
      const text = code ? code.innerText : '';
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      const old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = old; }, 1200);
    });
  });

  /* TTS -------------------------------------------------------------- */
  const synth = window.speechSynthesis;
  const ttsPanel = $('#ttsPanel');
  const ttsLaunch = $('#ttsLaunch');
  const ttsClose = $('#ttsClose');
  const ttsPlay = $('#ttsPlay');
  const ttsStop = $('#ttsStop');
  const ttsMute = $('#ttsMute');
  const ttsVolume = $('#ttsVolume');
  const ttsVolumeOut = $('#ttsVolumeOut');
  const ttsRate = $('#ttsRate');
  const ttsRateOut = $('#ttsRateOut');
  const ttsVoice = $('#ttsVoice');
  const ttsStatus = $('#ttsStatus');

  const state = {
    chunks: [],
    idx: 0,
    playing: false,
    paused: false,
    muted: false,
    volume: 0.9,
    lastVolume: 0.9,
    rate: 1,
    voice: null,
    session: 0,
    currentEl: null,
  };

  const supported = !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

  function openTts() {
    ttsPanel.classList.add('open');
    ttsPanel.setAttribute('aria-hidden', 'false');
    ttsLaunch.setAttribute('aria-expanded', 'true');
  }
  function closeTts() {
    ttsPanel.classList.remove('open');
    ttsPanel.setAttribute('aria-hidden', 'true');
    ttsLaunch.setAttribute('aria-expanded', 'false');
  }
  ttsLaunch.addEventListener('click', () => {
    ttsPanel.classList.contains('open') ? closeTts() : openTts();
  });
  ttsClose.addEventListener('click', closeTts);

  function cleanText(el) {
    let t = el.innerText || '';
    t = t.replace(/#\s*$/, '');
    t = t.replace(/\$\$[\s\S]*?\$\$/g, '。');
    t = t.replace(/\$[^$]*\$/g, '');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  function splitLong(text, maxLen) {
    if (text.length <= maxLen) return [text];
    const parts = [];
    let buf = '';
    const pieces = text.split(/(?<=[。！？；：])/);
    for (const p of pieces) {
      if ((buf + p).length > maxLen && buf) {
        parts.push(buf.trim());
        buf = '';
      }
      if (p.length > maxLen) {
        // Hard split very long sentence.
        for (let i = 0; i < p.length; i += maxLen) parts.push(p.slice(i, i + maxLen));
      } else {
        buf += p;
      }
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts.filter(Boolean);
  }

  function buildChunks() {
    const nodes = $$('.article h2, .article h3, .article p, .article li, .article blockquote, .article figcaption');
    const chunks = [];
    const seen = new Set();
    for (const el of nodes) {
      if (el.closest('.toc')) continue;
      if (el.closest('pre')) continue;
      if (el.tagName === 'LI' && el.querySelector('ul, ol')) continue;
      const text = cleanText(el);
      if (!text || text.length < 2) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      const parts = splitLong(text, 150);
      for (const part of parts) chunks.push({ el, text: part });
    }
    state.chunks = chunks;
    state.idx = 0;
    updateStatus();
  }

  function estimateMinutes() {
    const chars = state.chunks.reduce((n, c) => n + c.text.length, 0);
    const cps = 4.2 * state.rate;
    return Math.max(1, Math.round(chars / cps / 60));
  }

  function updateStatus() {
    if (!state.chunks.length) {
      ttsStatus.textContent = supported ? '未开始' : '浏览器不支持朗读';
      return;
    }
    if (state.playing && !state.paused) {
      ttsStatus.textContent = `朗读中 · ${state.idx + 1}/${state.chunks.length}`;
    } else if (state.paused) {
      ttsStatus.textContent = `已暂停 · ${state.idx + 1}/${state.chunks.length}`;
    } else {
      ttsStatus.textContent = `共 ${state.chunks.length} 段 · 约 ${estimateMinutes()} 分钟`;
    }
  }

  function highlight(el) {
    if (state.currentEl && state.currentEl !== el) state.currentEl.classList.remove('tts-active');
    state.currentEl = el;
    if (!el) return;
    el.classList.add('tts-active');
    const rect = el.getBoundingClientRect();
    const top = header ? header.offsetHeight : 60;
    if (rect.top < top + 10 || rect.bottom > window.innerHeight - 20) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function clearHighlight() {
    if (state.currentEl) state.currentEl.classList.remove('tts-active');
    state.currentEl = null;
  }

  function pickStartIndex() {
    const top = (header ? header.offsetHeight : 60) + 16;
    for (let i = 0; i < state.chunks.length; i++) {
      const r = state.chunks[i].el.getBoundingClientRect();
      if (r.bottom > top) return i;
    }
    return 0;
  }

  function speakChunk() {
    if (!supported) return;
    if (state.idx >= state.chunks.length) {
      finish();
      return;
    }
    const chunk = state.chunks[state.idx];
    highlight(chunk.el);
    updateStatus();

    const mySession = ++state.session;
    const utter = new SpeechSynthesisUtterance(chunk.text);
    utter.lang = state.voice ? state.voice.lang : 'zh-CN';
    if (state.voice) utter.voice = state.voice;
    utter.rate = state.rate;
    utter.pitch = 1;
    utter.volume = state.muted ? 0 : state.volume;

    utter.onend = () => {
      if (mySession !== state.session) return;
      if (!state.playing || state.paused) return;
      state.idx += 1;
      speakChunk();
    };
    utter.onerror = (e) => {
      if (mySession !== state.session) return;
      // 'interrupted' / 'canceled' are expected on stop/restart.
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (!state.playing || state.paused) return;
      state.idx += 1;
      speakChunk();
    };
    synth.speak(utter);
  }

  function finish() {
    state.playing = false;
    state.paused = false;
    state.session += 1;
    ttsPlay.classList.remove('playing');
    ttsPlay.setAttribute('aria-label', '播放');
    ttsLaunch.classList.remove('reading');
    clearHighlight();
    ttsStatus.textContent = '已读完';
  }

  function startFromCurrent() {
    if (!supported) {
      ttsStatus.textContent = '浏览器不支持朗读';
      return;
    }
    if (!state.chunks.length) buildChunks();
    state.idx = pickStartIndex();
    state.playing = true;
    state.paused = false;
    ttsPlay.classList.add('playing');
    ttsPlay.setAttribute('aria-label', '暂停');
    ttsLaunch.classList.add('reading');
    speakChunk();
  }

  function togglePlay() {
    if (!supported) return;
    if (state.playing && !state.paused) {
      synth.pause();
      state.paused = true;
      ttsPlay.classList.remove('playing');
      ttsPlay.setAttribute('aria-label', '继续');
      updateStatus();
      return;
    }
    if (state.playing && state.paused) {
      synth.resume();
      state.paused = false;
      ttsPlay.classList.add('playing');
      ttsPlay.setAttribute('aria-label', '暂停');
      updateStatus();
      return;
    }
    startFromCurrent();
  }

  function stopAll() {
    state.session += 1;
    if (supported) synth.cancel();
    state.playing = false;
    state.paused = false;
    ttsPlay.classList.remove('playing');
    ttsPlay.setAttribute('aria-label', '播放');
    ttsLaunch.classList.remove('reading');
    clearHighlight();
    ttsStatus.textContent = state.chunks.length ? `共 ${state.chunks.length} 段 · 约 ${estimateMinutes()} 分钟` : '未开始';
  }

  function restartCurrent() {
    if (!state.playing || state.paused) return;
    state.session += 1;
    synth.cancel();
    speakChunk();
  }

  ttsPlay.addEventListener('click', togglePlay);
  ttsStop.addEventListener('click', stopAll);

  ttsMute.addEventListener('click', () => {
    state.muted = !state.muted;
    ttsMute.classList.toggle('muted', state.muted);
    ttsMute.setAttribute('aria-pressed', String(state.muted));
    ttsMute.setAttribute('aria-label', state.muted ? '取消静音' : '静音');
    if (state.muted) {
      state.lastVolume = state.volume || 0.9;
      ttsVolume.value = 0;
      ttsVolumeOut.textContent = '0%';
    } else {
      state.volume = state.lastVolume || 0.9;
      ttsVolume.value = Math.round(state.volume * 100);
      ttsVolumeOut.textContent = Math.round(state.volume * 100) + '%';
    }
    restartCurrent();
  });

  ttsVolume.addEventListener('input', () => {
    const v = Number(ttsVolume.value);
    state.volume = v / 100;
    ttsVolumeOut.textContent = v + '%';
    if (v > 0 && state.muted) {
      state.muted = false;
      ttsMute.classList.remove('muted');
      ttsMute.setAttribute('aria-pressed', 'false');
      ttsMute.setAttribute('aria-label', '静音');
    }
    if (v === 0) {
      state.muted = true;
      ttsMute.classList.add('muted');
      ttsMute.setAttribute('aria-pressed', 'true');
      ttsMute.setAttribute('aria-label', '取消静音');
    }
    restartCurrent();
  });

  ttsRate.addEventListener('input', () => {
    const v = Number(ttsRate.value);
    state.rate = v / 100;
    ttsRateOut.textContent = state.rate.toFixed(1) + '×';
    updateStatus();
    restartCurrent();
  });

  function loadVoices() {
    if (!supported) return;
    const all = synth.getVoices() || [];
    const zh = all.filter((v) => /^zh/i.test(v.lang));
    const list = zh.length ? zh : all.filter((v) => /^cmn|^yue/i.test(v.lang));
    const current = ttsVoice.value;
    ttsVoice.innerHTML = '<option value="">自动（中文）</option>';
    list.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${v.name} · ${v.lang}${v.localService ? '' : ' · 在线'}`;
      ttsVoice.appendChild(opt);
    });
    if (current && ttsVoice.querySelector(`option[value="${current}"]`)) ttsVoice.value = current;
    if (!list.length) {
      const hint = ttsPanel.querySelector('.tts-hint');
      if (hint) hint.textContent = '未检测到中文语音，将使用系统默认声音。可在系统设置中添加中文语音。';
    }
  }

  ttsVoice.addEventListener('change', () => {
    if (!supported) return;
    const all = synth.getVoices() || [];
    const zh = all.filter((v) => /^zh/i.test(v.lang));
    const list = zh.length ? zh : all.filter((v) => /^cmn|^yue/i.test(v.lang));
    const idx = Number(ttsVoice.value);
    state.voice = ttsVoice.value === '' ? null : list[idx] || null;
    restartCurrent();
  });

  if (supported) {
    loadVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 400);
    setTimeout(loadVoices, 1200);
  } else {
    ttsStatus.textContent = '浏览器不支持朗读';
    ttsPlay.disabled = true;
    ttsStop.disabled = true;
    ttsMute.disabled = true;
  }

  // If the user clicks a paragraph while the panel is open, start from there.
  article.addEventListener('click', (e) => {
    if (!ttsPanel.classList.contains('open')) return;
    if (e.target.closest('a, button, img')) return;
    const el = e.target.closest('p, li, blockquote, h2, h3, figcaption');
    if (!el) return;
    if (!state.chunks.length) buildChunks();
    const found = state.chunks.findIndex((c) => c.el === el);
    if (found >= 0) {
      if (state.playing) stopAll();
      state.idx = found;
      startFromCurrent();
    }
  });

  /* Keyboard --------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightbox.classList.contains('open')) closeLightbox();
      else if (ttsPanel.classList.contains('open')) closeTts();
      else if (tocWrap.classList.contains('open')) closeToc();
    }
    // Space toggles TTS only when the panel is open and focus is not in a form.
    if (e.code === 'Space' && ttsPanel.classList.contains('open')) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
      e.preventDefault();
      togglePlay();
    }
  });

  /* KaTeX ------------------------------------------------------------ */
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(article, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        ignoredClasses: ['tex2jax_ignore'],
        throwOnError: false,
      });
    } catch (err) {
      console.warn('KaTeX render failed:', err);
    }
  }

  /* Keep chapter label + title + opening quote together in print ----- */
  $$('.chapter').forEach((ch) => {
    const label = ch.querySelector('.chapter-label');
    const h2 = ch.querySelector('h2');
    const first = h2 && h2.nextElementSibling;
    if (label && h2 && first && first.matches('.pull-quote, .craft-note')) {
      const head = document.createElement('div');
      head.className = 'chapter-head';
      ch.insertBefore(head, label);
      head.append(label, h2, first);
    }
  });

  /* Horizontal table affordance on narrow screens ------------------- */
  function markScrollableTables() {
    $$('.table-hint').forEach((el) => el.remove());
    $$('.table-wrap').forEach((wrap) => {
      if (wrap.scrollWidth <= wrap.clientWidth + 4) return;
      const hint = document.createElement('div');
      hint.className = 'table-hint';
      hint.textContent = '表格可左右滑动 →';
      wrap.parentNode.insertBefore(hint, wrap);
    });
  }
  window.addEventListener('load', markScrollableTables);
  let tableResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(tableResizeTimer);
    tableResizeTimer = setTimeout(markScrollableTables, 180);
  });

  /* Initial TOC state ------------------------------------------------ */
  updateActiveToc();
  updateStatus();

  /* Deep-link helper for screenshots / sharing: ?scroll=ch4&theme=light */
  const scrollTarget = params.get('scroll');
  if (scrollTarget) {
    const jump = () => {
      const el = document.getElementById(scrollTarget);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight + 12 : 72);
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    };
    window.addEventListener('load', () => setTimeout(jump, 120));
    setTimeout(jump, 500);
  }
})();
