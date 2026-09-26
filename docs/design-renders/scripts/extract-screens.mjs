import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, file, out] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1200 } });
await p.goto('http://localhost:8765/' + encodeURIComponent(file), { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(5000);
const data = await p.$$eval('[data-screen-label]', els => els.map(el => {
  const kids = [...el.children];
  return { label: el.getAttribute('data-screen-label'),
    screenText: (kids[1]?.innerText || '').replace(/\n{2,}/g, '\n'),
    caption: kids.slice(2).map(k => k.innerText).join('\n'),
    customEls: [...new Set([...el.querySelectorAll('*')].map(n => n.tagName.toLowerCase()).filter(t => t.includes('-')))],
    doodles: [...new Set([...el.querySelectorAll('doodle-art')].map(n => n.getAttribute('kind')))],
    motion: [...el.querySelectorAll('tg-motion')].map(n => n.getAttribute('fx') || n.getAttribute('kf')).filter(Boolean).slice(0, 12) };
}));
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log(file, data.length);
await b.close();
