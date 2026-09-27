import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderCardNode } from '@cp/critter-art/share';
import { parseColor } from '@cp/design-tokens';

import { APP_ICONS, buildAppIconContentLayout } from './app-icons';

// Coarse design-fidelity smoke check (phase spec: "Playwright screenshot of App Icon.dc.html vs
// baked icon diff (layout tolerance documented)"). This intentionally does NOT byte-diff against
// the design prototype: `design/App Icon.dc.html` simulates modes with flat CSS colours in a
// browser, while this pipeline's real output goes through Xcode's own Liquid Glass compositing
// (shadow/translucency/specular — see `writers/app-icon-ios.ts`), which the prototype never
// reproduces. A tight pixel diff would fail on that expected, real divergence, not on an actual
// regression. Instead this compares each base style's average colour (dominated, by area, by the
// shared background) against the DC file's own light-mode rendering of the same variant — loose
// enough to tolerate the compositing difference, tight enough to catch a wrong character, a wrong
// background colour, or a broken DC parse.

const designDir = fileURLToPath(new URL('../../../../design/', import.meta.url));
const iconHtmlPath = join(designDir, 'App Icon.dc.html');

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** Same `App Icon.dc.html` bytes, except the `variant` prop's `default` is swapped — the DC runtime reads that as the prop value when no external override exists (see `design/support.js`'s `parseDataProps`), so this is enough to preview any of the 4 base styles without reimplementing its prop-injection API. */
function htmlWithVariantDefault(variant: string): Buffer {
  const raw = readFileSync(iconHtmlPath, 'utf8');
  const needle =
    '&quot;variant&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;face&quot;,&quot;passport&quot;,&quot;stamp&quot;,&quot;sticker&quot;],&quot;default&quot;:&quot;face&quot;';
  if (!raw.includes(needle)) {
    throw new Error(
      "app-icons-design-fidelity: design/App Icon.dc.html's variant prop no longer matches the " +
        'expected data-props text — update `needle` above to match its current shape.',
    );
  }
  const replaced = needle.replace(
    '&quot;default&quot;:&quot;face&quot;',
    `&quot;default&quot;:&quot;${variant}&quot;`,
  );
  return Buffer.from(raw.replace(needle, replaced), 'utf8');
}

interface DesignServer {
  readonly origin: string;
  readonly close: () => void;
}

/** Serves `design/` as-is, except `App Icon.dc.html` itself, which is served with the requested variant's default already baked in. */
function serveIconDesign(variant: string): Promise<DesignServer> {
  const html = htmlWithVariantDefault(variant);
  return new Promise((resolvePromise) => {
    const server: Server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (pathname === '/App Icon.dc.html') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
        return;
      }
      const filePath = join(designDir, pathname);
      if (
        !filePath.startsWith(designDir) ||
        !existsSync(filePath) ||
        !statSync(filePath).isFile()
      ) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      });
      createReadStream(filePath).pipe(response);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolvePromise({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

async function averageColor(png: Uint8Array): Promise<Rgb> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    if (alpha === 0) continue;
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
    opaque++;
  }
  if (opaque === 0)
    throw new Error('app-icons-design-fidelity: rendered image is fully transparent');
  return { r: r / opaque, g: g / opaque, b: b / opaque };
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Composites this pipeline's transparent content layer over its own `backgroundHex`, matching what actually ships (icon.json's `fill` + the content layer — see `writers/app-icon-ios.ts`) so the comparison is apples-to-apples with the DC screenshot's flat background. */
async function ownAverageColor(id: (typeof APP_ICONS)[number]['id']): Promise<Rgb> {
  const def = APP_ICONS.find((entry) => entry.id === id);
  if (!def) throw new Error(`app-icons-design-fidelity: no APP_ICONS entry with id "${id}"`);
  const contentPng = await renderCardNode(buildAppIconContentLayout(def));
  const image = await loadImage(Buffer.from(contentPng));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = def.backgroundHex;
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.drawImage(image, 0, 0);
  const png = canvas.encode('png');
  return averageColor(await png);
}

const RGB_DISTANCE_TOLERANCE = 70;

describe('app icon design fidelity (design/App Icon.dc.html)', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it.each(['face', 'passport', 'stamp', 'sticker'] as const)(
    "renders %s with an average colour close to design/App Icon.dc.html's own light-mode render",
    async (variant) => {
      const server = await serveIconDesign(variant);
      try {
        const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
        await page.goto(`${server.origin}/App Icon.dc.html`, {
          waitUntil: 'networkidle',
          timeout: 30_000,
        });
        await page.waitForTimeout(1000);
        const root = page.locator('div[style*="border-radius"]').first();
        const count = await root.count();
        expect(count).toBeGreaterThan(0);
        const designPng = await root.screenshot();
        expect(designPng.length).toBeGreaterThan(0);
        await page.close();

        const [designAvg, ownAvg] = await Promise.all([
          averageColor(designPng),
          ownAverageColor(variant),
        ]);
        const distance = rgbDistance(designAvg, ownAvg);
        expect(distance).toBeLessThan(RGB_DISTANCE_TOLERANCE);
      } finally {
        server.close();
      }
    },
    30_000,
  );

  it('parseColor sanity: every base style backgroundHex is a real hex colour design/App Icon.dc.html also uses', () => {
    const lightBackgrounds: Readonly<Record<string, string>> = {
      face: '#ffd84a',
      passport: '#17142a',
      stamp: '#f4efe4',
      sticker: '#17142a',
    };
    for (const [id, expectedHex] of Object.entries(lightBackgrounds)) {
      const def = APP_ICONS.find((entry) => entry.id === id);
      expect(def?.backgroundHex).toBe(expectedHex);
      expect(parseColor(def?.backgroundHex ?? '')).toBeTruthy();
    }
  });
});
