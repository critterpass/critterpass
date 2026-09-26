import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:8765/Critterpass.dc.html', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(6000);
const n = await p.$$eval('[data-screen-label]', els => els.length);
console.log('screens', n);
const els = await p.$$('[data-screen-label]');
let i = 0;
for (const el of els) {
  const lab = await el.getAttribute('data-screen-label');
  const phone = await el.$(':scope > div:nth-child(2)');
  const f = `${out}/${lab.replace(/[^a-zA-Z0-9-]+/g, '_')}.png`;
  try { await (phone || el).scrollIntoViewIfNeeded(); await p.waitForTimeout(250); await (phone || el).screenshot({ path: f }); i++; } catch (e) { console.log('fail', lab, e.message.slice(0, 80)); }
}
console.log('done', i);
await b.close();
