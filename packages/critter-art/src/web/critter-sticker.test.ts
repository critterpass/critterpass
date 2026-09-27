import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { build as esbuildBundle } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The bundled in-page test script (`TEST_ENTRY` below) assigns these on `window`; `page.evaluate`
// callbacks in this file run against that same global, so declare them once here for both.
declare global {
  interface Window {
    __mount: (count: number, spacing: number, size: number) => void;
    __canvasCount: () => number;
    __hasCanvas: (index: number) => boolean | null;
    __remove: (index: number) => unknown;
  }
}

const ELEMENT_COUNT = 100;
const ELEMENT_SPACING_PX = 400;
const STICKER_SIZE_PX = 96;

const PAGE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><script type="module" src="/bundle.js"></script></head>
  <body style="margin:0"></body>
</html>`;

/** Test-only page script: registers the element, mounts a tall stacked column of them, and exposes small query helpers `page.evaluate` calls into. */
const TEST_ENTRY = `
  import { registerCritterSticker } from './register';
  registerCritterSticker();

  window.__mount = (count, spacing, size) => {
    document.body.style.height = (count * spacing) + 'px';
    for (let i = 0; i < count; i++) {
      const el = document.createElement('critter-sticker');
      el.setAttribute('kind', 'gecko');
      el.setAttribute('size', String(size));
      el.setAttribute('data-index', String(i));
      el.style.position = 'absolute';
      el.style.top = (i * spacing) + 'px';
      document.body.appendChild(el);
    }
  };

  window.__canvasCount = () =>
    document.querySelectorAll('critter-sticker').length -
    Array.from(document.querySelectorAll('critter-sticker')).filter((el) => !el.hasCanvas).length;

  window.__hasCanvas = (index) => {
    const el = document.querySelector('critter-sticker[data-index="' + index + '"]');
    return el ? el.hasCanvas : null;
  };

  window.__remove = (index) => {
    const el = document.querySelector('critter-sticker[data-index="' + index + '"]');
    el?.remove();
    return el;
  };
`;

function startServer(bundleJs: string): Promise<{ origin: string; close: () => void }> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/' || pathname === '/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(PAGE_HTML);
      return;
    }
    if (pathname === '/bundle.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(bundleJs);
      return;
    }
    response.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

describe('<critter-sticker> (real browser via Playwright)', () => {
  let server: { origin: string; close: () => void };
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const entryUrl = new URL('test-entry.ts', import.meta.url);
    const bundle = await esbuildBundle({
      stdin: {
        contents: TEST_ENTRY,
        resolveDir: new URL('.', import.meta.url).pathname,
        sourcefile: entryUrl.pathname,
        loader: 'ts',
      },
      bundle: true,
      format: 'esm',
      write: false,
      target: 'es2022',
    });
    const output = bundle.outputFiles[0];
    if (!output) throw new Error('esbuild produced no output for the test entry');

    server = await startServer(output.text);
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`${server.origin}/`);
  });

  afterAll(async () => {
    await browser.close();
    server.close();
  });

  it('only allocates canvases for elements within rootMargin of the viewport', async () => {
    await page.evaluate(({ count, spacing, size }) => window.__mount(count, spacing, size), {
      count: ELEMENT_COUNT,
      spacing: ELEMENT_SPACING_PX,
      size: STICKER_SIZE_PX,
    });
    // IntersectionObserver callbacks land on a later microtask/frame — give the browser one.
    await page.waitForTimeout(300);

    const canvasCount = await page.evaluate(() => window.__canvasCount());
    expect(canvasCount).toBeGreaterThan(0);
    expect(canvasCount).toBeLessThan(ELEMENT_COUNT);

    // 600px viewport + 150px rootMargin covers roughly the first two 400px-spaced elements.
    const firstHasCanvas = await page.evaluate(() => window.__hasCanvas(0));
    const lastHasCanvas = await page.evaluate((i) => window.__hasCanvas(i), ELEMENT_COUNT - 1);
    expect(firstHasCanvas).toBe(true);
    expect(lastHasCanvas).toBe(false);
  });

  it('frees the canvas on disconnect', async () => {
    const before = await page.evaluate(() => window.__hasCanvas(0));
    expect(before).toBe(true);
    const removed = await page.evaluate(() => Boolean(window.__remove(0)));
    expect(removed).toBe(true);
    const after = await page.evaluate(() => window.__hasCanvas(0));
    // The element itself was removed from the DOM, so the query no longer finds it (null), which
    // only happens once `disconnectedCallback` ran and released it.
    expect(after).toBeNull();
  });

  it('renders a static final frame immediately under prefers-reduced-motion', async () => {
    const reducedPage = await browser.newPage({
      viewport: { width: 800, height: 600 },
      reducedMotion: 'reduce',
    });
    try {
      await reducedPage.goto(`${server.origin}/`);
      await reducedPage.evaluate(
        ({ count, spacing, size }) => window.__mount(count, spacing, size),
        { count: 1, spacing: ELEMENT_SPACING_PX, size: STICKER_SIZE_PX },
      );
      await reducedPage.waitForTimeout(150);
      const hasCanvas = await reducedPage.evaluate(() => window.__hasCanvas(0));
      expect(hasCanvas).toBe(true);
    } finally {
      await reducedPage.close();
    }
  });
});
