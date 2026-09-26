// Renders whole design pages to docs/design-renders/pages (PNG) and pages-text (visible text).
/* global document -- page.evaluate callbacks run inside the browser */
//   pnpm --filter @cp/design-renders run render:pages -- "Site - Home.dc.html" ...
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

import { rendersDir, serveDesign } from './serve-design.mjs';

const files = process.argv.slice(2);
const server = await serveDesign();
const browser = await chromium.launch();
try {
  for (const file of files) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(`${server.origin}/${encodeURIComponent(file)}`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      });
      await page.waitForTimeout(4000);
      const text = await page.evaluate(() => document.body.innerText);
      const slug = file.replace('.dc.html', '').replace(/[^a-zA-Z0-9]+/g, '-');
      writeFileSync(path.join(rendersDir, 'pages-text', `${slug}.txt`), text);
      await page.screenshot({
        path: path.join(rendersDir, 'pages', `${slug}.png`),
        fullPage: true,
      });
      console.log(file, text.length);
    } catch (error) {
      console.log('fail', file, String(error).slice(0, 100));
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
