// Extracts visible text, captions, doodles and motion hints per screen into docs/design-renders/screens.json.
//   pnpm --filter @cp/design-renders run extract:screens [-- "Critterpass.dc.html" <out.json>]
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

import { rendersDir, serveDesign } from './serve-design.mjs';

const [file = 'Critterpass.dc.html', out = path.join(rendersDir, 'screens.json')] =
  process.argv.slice(2);
const server = await serveDesign();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(`${server.origin}/${encodeURIComponent(file)}`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.waitForTimeout(5000);
  const data = await page.$$eval('[data-screen-label]', (elements) =>
    elements.map((element) => {
      const children = [...element.children];
      return {
        label: element.getAttribute('data-screen-label'),
        screenText: (children[1]?.innerText || '').replace(/\n{2,}/g, '\n'),
        caption: children
          .slice(2)
          .map((child) => child.innerText)
          .join('\n'),
        customEls: [
          ...new Set(
            [...element.querySelectorAll('*')]
              .map((node) => node.tagName.toLowerCase())
              .filter((tag) => tag.includes('-')),
          ),
        ],
        doodles: [
          ...new Set(
            [...element.querySelectorAll('doodle-art')].map((node) => node.getAttribute('kind')),
          ),
        ],
        motion: [...element.querySelectorAll('tg-motion')]
          .map((node) => node.getAttribute('fx') || node.getAttribute('kf'))
          .filter(Boolean)
          .slice(0, 12),
      };
    }),
  );
  writeFileSync(out, JSON.stringify(data, null, 1));
  console.log(file, data.length);
} finally {
  await browser.close();
  server.close();
}
