#!/usr/bin/env node
/**
 * shoot.mjs — minimal CDP screenshot helper (no Puppeteer).
 * Usage:
 *   node scripts/shoot.mjs --url http://127.0.0.1:8765/ --out /tmp/a.png \
 *     --width 1440 --height 1100 [--scroll ch4] [--full]
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const has = (k) => args.includes('--' + k);

const url = get('url', 'http://127.0.0.1:8765/');
const out = get('out', '/tmp/shot.png');
const width = Number(get('width', 1440));
const height = Number(get('height', 1100));
const scroll = get('scroll', '');
const full = has('full');
const evalExpr = get('eval', '');

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let id = 0;
const pending = new Map();
const events = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method && events.has(m.method)) {
    for (const fn of events.get(m.method)) fn(m.params);
  }
};

function send(method, params = {}) {
  return new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
function once(method) {
  return new Promise((res) => {
    if (!events.has(method)) events.set(method, []);
    events.get(method).push(res);
  });
}

await send('Page.enable');
await send('Runtime.enable');

const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url });
await Promise.race([loaded, new Promise((r) => setTimeout(r, 4000))]);
await new Promise((r) => setTimeout(r, 900));

// Navigation can reset the emulation; apply it again after load.
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: false,
  screenWidth: width, screenHeight: height,
});

// Wait for web fonts (KaTeX) and all figures so layout is stable.
await send('Runtime.evaluate', {
  expression: `(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.complete ? true : new Promise((r) => {
      img.onload = r; img.onerror = r;
    })));
    return true;
  })()`,
  awaitPromise: true,
  returnByValue: true,
});

if (scroll) {
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      const el = document.getElementById(${JSON.stringify(scroll)});
      if (!el) return 'missing';
      const y = el.getBoundingClientRect().top + window.scrollY - 92;
      window.scrollTo(0, Math.max(0, y));
      return 'ok:' + Math.round(y);
    })()`,
    returnByValue: true,
  });
  await new Promise((r) => setTimeout(r, 700));
}

if (evalExpr) {
  await send('Runtime.evaluate', { expression: evalExpr, awaitPromise: true, returnByValue: true });
  await new Promise((r) => setTimeout(r, 700));
}

let clip;
if (full) {
  const metrics = await send('Page.getLayoutMetrics');
  const h = Math.ceil(metrics.result.cssContentSize.height);
  clip = { x: 0, y: 0, width, height: h, scale: 1 };
}
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: full,
  ...(clip ? { clip } : {}),
});
if (shot.result && shot.result.data) {
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
} else {
  console.error(shot);
  process.exit(1);
}
ws.close();
