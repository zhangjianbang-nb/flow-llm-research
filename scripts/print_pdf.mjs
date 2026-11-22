#!/usr/bin/env node
/**
 * print_pdf.mjs — render the site to PDF through Chrome DevTools Protocol.
 * No Puppeteer/Playwright needed. Requires Chrome with --remote-debugging-port=9222.
 *
 * Usage: node scripts/print_pdf.mjs [--url http://127.0.0.1:8765/] [--out report.pdf]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const url = get('url', 'http://127.0.0.1:8765/');
const out = path.resolve(get('out', 'report.pdf'));

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
await Promise.race([loaded, new Promise((r) => setTimeout(r, 5000))]);
await new Promise((r) => setTimeout(r, 900));

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

const pdf = await send('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
});

if (!pdf.result || !pdf.result.data) {
  console.error(pdf);
  process.exit(1);
}
fs.writeFileSync(out, Buffer.from(pdf.result.data, 'base64'));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
ws.close();
