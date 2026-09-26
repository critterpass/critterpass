// Break down per-frame raster cost at 300pt: sticker+shadow vs multiply washes vs plain.
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.route('http://localhost:8765/__probe.html', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(dir + 'probe.html', 'utf8') }));
await page.goto('http://localhost:8765/__probe.html');
await page.waitForFunction(() => window.CritterDex && window.CritterDex.ready);
await page.addScriptTag({ path: dir + 'bench-page-helpers.js' });
const res = await page.evaluate(() => {
  const out = [];
  const t = (label, attrs, pre) => { const el = P.mk(Object.assign({ size: 300, anim: 'none', seed: 7 }, attrs)); el.setup(); if (pre) pre(el); el.draw(1); P.flush(el);
    const n = 12, t0 = performance.now(); for (let i = 0; i < n; i++) { el.draw(1); P.flush(el); } out.push([label, +((performance.now() - t0) / n).toFixed(2)]); el.remove(); };
  for (const k of ['gecko', 'cp-013']) {
    t(k + ' sticker+shadow, multiply', { kind: k, sticker: '#f4efe4' });
    t(k + ' sticker, shadow off', { kind: k, sticker: '#f4efe4' }, el => { const c = el.cv.getContext('2d'); const d = el.draw.bind(el); el.draw = p => { const s = CanvasRenderingContext2D.prototype; const o = Object.getOwnPropertyDescriptor(s, 'shadowBlur'); Object.defineProperty(c, 'shadowBlur', { set() {}, get() { return 0; }, configurable: true }); d(p); delete c.shadowBlur; }; });
    t(k + ' no sticker, multiply', { kind: k });
    t(k + ' no sticker, source-over', { kind: k, blend: 'source-over' });
    t(k + ' cached bitmap blit (drawImage of finished frame)', { kind: k, sticker: '#f4efe4' }, el => { const snap = document.createElement('canvas'); snap.width = el.cv.width; snap.height = el.cv.height; el.draw(1); snap.getContext('2d').drawImage(el.cv, 0, 0); el.draw = () => { const c = el.cv.getContext('2d'); c.setTransform(1,0,0,1,0,0); c.clearRect(0, 0, el.cv.width, el.cv.height); c.drawImage(snap, 0, 0); }; });
  }
  return out;
});
res.forEach(r => console.log(r[1].toString().padStart(6), 'ms ', r[0]));
await b.close();
