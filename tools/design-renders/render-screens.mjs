// Renders every [data-screen-label] phone frame of design/Critterpass.dc.html to docs/design-renders/screens.
//   pnpm --filter @cp/design-renders run render:screens [-- --only "3c-9 Pon's draft"] [--out <dir>]
import path from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { rendersDir, screenFileName, serveDesign } from './serve-design.mjs';

export async function renderScreens({ only = [], outDir = path.join(rendersDir, 'screens') } = {}) {
  const server = await serveDesign();
  const browser = await chromium.launch();
  const rendered = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor: 1,
    });
    await page.goto(`${server.origin}/Critterpass.dc.html`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await page.waitForTimeout(6000);
    for (const element of await page.$$('[data-screen-label]')) {
      const label = await element.getAttribute('data-screen-label');
      if (!label || (only.length > 0 && !only.includes(label))) continue;
      const phone = await element.$(':scope > div:nth-child(2)');
      const target = phone ?? element;
      const file = path.join(outDir, screenFileName(label));
      try {
        await target.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await target.screenshot({ path: file });
        // Boxes of live-animated parts, relative to the captured frame, so comparisons can ignore them.
        const frame = await target.boundingBox();
        const animatedBoxes = [];
        for (const animated of await target.$$('doodle-art, canvas, tg-motion')) {
          const box = await animated.boundingBox();
          if (box && frame)
            animatedBoxes.push({
              x: box.x - frame.x,
              y: box.y - frame.y,
              width: box.width,
              height: box.height,
            });
        }
        rendered.push({ label, file, animatedBoxes });
      } catch (error) {
        console.log('fail', label, String(error).slice(0, 80));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return rendered;
}

if (import.meta.main) {
  // pnpm forwards a literal `--` separator; drop it before parsing.
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: { only: { type: 'string', multiple: true }, out: { type: 'string' } },
  });
  const rendered = await renderScreens({
    only: values.only ?? [],
    ...(values.out ? { outDir: path.resolve(values.out) } : {}),
  });
  console.log('rendered', rendered.length);
}
