// Renders every phone frame of the premium design (design/premium/CritterPass NN *.dc.html) to
// docs/design-renders/premium/<code>.png and rewrites screens.json (code, part, label, file).
//   pnpm --filter @cp/design-renders run render:premium [-- --part 04]
// A frame is any 390×844 div with a 56 px radius (imported Phone or drawn inline); its code comes from the
// nearest data-screen-label ancestor, else the "N.NN label" line under the phone.
import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const designDir = path.join(repoRoot, 'design/premium');
const outDir = path.join(repoRoot, 'docs/design-renders/premium');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function serve() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = path.join(designDir, pathname);
    if (!file.startsWith(designDir) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    }),
  );
}

const isFrame = (d) =>
  d.style.width === '390px' && d.style.height === '844px' && d.style.borderRadius === '56px';

async function renderPart(page, origin, file) {
  await page.goto(`${origin}/${encodeURIComponent(file)}`, {
    waitUntil: 'networkidle',
    timeout: 180_000,
  });
  // The canvas runtime renders lazily: wait until the frame count holds steady.
  let last = -1;
  for (let stable = 0, tick = 0; tick < 90 && stable < 4; tick++) {
    await page.waitForTimeout(1000);
    const count = await page.evaluate(
      (src) => [...document.querySelectorAll('div')].filter(new Function(`return ${src}`)()).length,
      isFrame.toString(),
    );
    stable = count === last && count > 0 ? stable + 1 : 0;
    last = count;
  }
  const frames = await page.evaluate((src) => {
    const frameTest = new Function(`return ${src}`)();
    return [...document.querySelectorAll('div')].filter(frameTest).map((frame, index) => {
      frame.setAttribute('data-premium-shot', String(index));
      const owner = frame.closest('[data-screen-label]')?.getAttribute('data-screen-label') ?? '';
      if (/^\d+\.\d+ /.test(owner))
        return { code: owner.split(' ')[0], label: owner.replace(/^\S+\s*/, '') };
      const caption = [...(frame.parentElement?.children ?? [])].find(
        (c) => c !== frame && /^\s*\d+\.\d+/.test(c.textContent ?? ''),
      );
      const text = caption?.textContent?.trim() ?? '';
      return {
        code: text.match(/^\d+\.\d+/)?.[0] ?? `x${index}`,
        label: text.replace(/^\d+\.\d+\s*/, '').slice(0, 120),
      };
    });
  }, isFrame.toString());
  const rendered = [];
  for (const [index, frame] of frames.entries()) {
    const taken = rendered.some((r) => r.code === frame.code);
    const name = `${frame.code}${taken ? `-${index}` : ''}.png`;
    const element = await page.$(`[data-premium-shot="${index}"]`);
    await element.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await element.screenshot({ path: path.join(outDir, name) });
    rendered.push({ ...frame, file: name });
  }
  return rendered;
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({ args, options: { part: { type: 'string', multiple: true } } });
  const parts = readdirSync(designDir)
    .filter((f) => /^CritterPass (0[1-9]|10) .+\.dc\.html$/.test(f))
    .filter((f) => !values.part || values.part.includes(f.slice(12, 14)));
  const indexPath = path.join(outDir, 'screens.json');
  const previous = existsSync(indexPath)
    ? JSON.parse((await import('node:fs')).readFileSync(indexPath, 'utf8'))
    : [];
  const server = await serve();
  const browser = await chromium.launch();
  const screens = previous.filter((s) => !parts.some((f) => Number(f.slice(12, 14)) === s.part));
  try {
    const page = await browser.newPage({
      viewport: { width: 1800, height: 1200 },
      deviceScaleFactor: 1,
    });
    for (const file of parts) {
      const part = Number(file.slice(12, 14));
      const partName = file.slice(15, -'.dc.html'.length);
      for (const frame of await renderPart(page, server.origin, file))
        screens.push({ ...frame, part, partName });
      console.log('rendered', file);
    }
  } finally {
    await browser.close();
    server.close();
  }
  screens.sort((a, b) => a.part - b.part || a.code.localeCompare(b.code, 'en', { numeric: true }));
  writeFileSync(indexPath, `${JSON.stringify(screens, null, 1)}\n`);
}
