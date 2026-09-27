// Ground truth for the pixel-diff test: runs the real, unmodified design/doodles.js in headless
// Chromium (same pattern as tools/design-renders' golden screens, and the production plan for
// packages/critter-art in system-architecture.md §4.7 — "Chromium render of untouched design
// scripts vs core output"). design/ is never edited or copied; only executed as-is via Playwright.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOODLES_JS_PATH = path.resolve(here, '../../../../design/doodles.js');

export interface ReferenceRenderOptions {
  readonly size?: number;
  readonly pose?: string;
}

// This project has no "DOM" lib (it's a Node package); page.evaluate() callbacks below still
// type-check against whatever globals are declared here, so these are minimal, module-scoped
// shapes for the one browser API surface this file touches — not a global DOM lib import.
interface BrowserElement {
  setAttribute(name: string, value: string): void;
}
interface DoodleArtElement {
  setup?: () => void;
  draw?: (progress: number) => void;
}
interface BrowserDocument {
  createElement(tagName: string): BrowserElement;
  body: { appendChild(node: BrowserElement): void };
  querySelector(selector: 'doodle-art'): DoodleArtElement | null;
}
declare const document: BrowserDocument;

/** Renders Tokek via the real design/doodles.js `<doodle-art>` element, fully drawn (progress=1). */
export async function renderReferenceGeckoPng(options: ReferenceRenderOptions = {}): Promise<Buffer> {
  const size = options.size ?? 200;
  const pose = options.pose ?? 'idle';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent('<!doctype html><html><body style="margin:0;background:#ffffff"></body></html>');
    await page.addScriptTag({ path: DOODLES_JS_PATH });
    await page.evaluate(
      ({ pose, size }) => {
        const el = document.createElement('doodle-art');
        el.setAttribute('kind', 'gecko');
        el.setAttribute('pose', pose);
        el.setAttribute('size', String(size));
        el.setAttribute('blink', 'false');
        // Its own IntersectionObserver calls play() asynchronously once connected, which would
        // otherwise race the explicit setup()/draw(1) below and repaint a mid-animation frame.
        // anim="none" makes play() resolve straight to the same fully-drawn frame either way.
        el.setAttribute('anim', 'none');
        document.body.appendChild(el);
      },
      { pose, size },
    );
    await page.waitForSelector('doodle-art canvas');
    // Force a fully-drawn, deterministic frame instead of racing the element's own rAF entrance
    // animation (play()) or its randomised blink timer (startBlink()).
    await page.evaluate(() => {
      const el = document.querySelector('doodle-art');
      el?.setup?.();
      el?.draw?.(1);
    });
    const canvasHandle = await page.$('doodle-art canvas');
    if (!canvasHandle) throw new Error('design/doodles.js did not create a <canvas> inside <doodle-art>');
    return await canvasHandle.screenshot();
  } finally {
    await browser.close();
  }
}
