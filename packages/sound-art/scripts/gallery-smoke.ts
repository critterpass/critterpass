import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.caf': 'audio/x-caf',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.json': 'application/json',
};

/**
 * A one-shot smoke check for the baked listening gallery: serves `gallery/` + `out/` over a local
 * static server, loads the page in headless Chromium, and fails if there are any console errors or
 * an `<audio>` element that never reaches a playable state (`readyState` stays 0).
 */
async function main(): Promise<void> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const filePath = path.join(ROOT, decodeURIComponent(url.pathname));
    try {
      const body = readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`http://localhost:${port}/gallery/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const audioCount = await page.locator('audio').count();
    if (audioCount === 0) throw new Error('gallery smoke: expected at least one <audio> element');

    // `nodes` are real DOM elements at runtime (evaluated inside the browser); this package's
    // tsconfig has no `dom` lib (kept DOM-free outside the backend, as critter-art's golden runner
    // does), so a minimal local shape stands in for `HTMLAudioElement` here.
    const readyStates = await page.$$eval('audio', (nodes) =>
      (nodes as { readyState: number }[]).map((n) => n.readyState),
    );
    const notResolved = readyStates.filter((state) => state === 0).length;
    if (notResolved > 0) {
      throw new Error(
        `gallery smoke: ${notResolved}/${readyStates.length} <audio> elements never resolved a source`,
      );
    }
    if (consoleErrors.length > 0) {
      throw new Error(`gallery smoke: console errors:\n${consoleErrors.join('\n')}`);
    }

    console.log(
      `gallery smoke: OK (${audioCount} audio elements, all resolved, no console errors)`,
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
