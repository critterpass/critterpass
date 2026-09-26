import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, out, shotdir, ...files] = process.argv;
const b = await chromium.launch();
for (const file of files) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await p.goto('http://localhost:8765/' + encodeURIComponent(file), { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(4000);
    const t = await p.evaluate(() => document.body.innerText);
    const slug = file.replace('.dc.html', '').replace(/[^a-zA-Z0-9]+/g, '-');
    fs.writeFileSync(`${out}/${slug}.txt`, t);
    await p.screenshot({ path: `${shotdir}/${slug}.png`, fullPage: true });
    console.log(file, t.length);
  } catch (e) { console.log('fail', file, e.message.slice(0, 100)); }
  await p.close();
}
await b.close();
