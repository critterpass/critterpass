import { existsSync, readFileSync } from 'node:fs';

import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

// The yellow JOIN THE WAITLIST pill (header and final call) must stay readable at rest and on
// hover. It once rendered cream-on-yellow, then yellow-on-yellow on hover, because a bare
// `.cs-root a` link rule out-ranked the pill's own colours.

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const tokensCss = read('./tokens.css');
const pageCss = read('./coming-soon.css').replace(/\/\*[\s\S]*?\*\//g, '');
const allCss = [
  tokensCss,
  pageCss,
  read('./coming-soon-sections.css'),
  read('./coming-soon-cards.css'),
].join('\n');

const MIN_RATIO = 4.5;

function channels(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex?.[1]) {
    const value = hex[1];
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(
    color.trim(),
  );
  if (!rgb) throw new Error(`Unsupported colour: ${color}`);
  if (rgb[4] !== undefined && Number(rgb[4]) < 1) throw new Error(`Translucent colour: ${color}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function declarations(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const decl of (match[2] ?? '').split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (prop && rest.length) out[prop.trim()] = rest.join(':').trim();
    }
  }
  return out;
}

function resolveToken(value: string): string {
  const name = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  if (!name) return value;
  const token = new RegExp(`${name}:\\s*([^;]+);`).exec(tokensCss)?.[1];
  if (!token) throw new Error(`Unknown token ${name}`);
  return token.trim();
}

describe('join button contrast', () => {
  it('declares text and background colours that stay above 4.5:1 at rest and on hover', () => {
    const rest = declarations(pageCss, '.cs-cta');
    const hover = { ...rest, ...declarations(pageCss, '.cs-cta:hover') };
    for (const state of [rest, hover]) {
      expect(state.color, 'text colour').toBeDefined();
      expect(state.background, 'background').toBeDefined();
      const ratio = contrast(resolveToken(state.color ?? ''), resolveToken(state.background ?? ''));
      expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  });

  it('keeps page-wide link colours at zero specificity so they cannot override the button', () => {
    const linkRules = [...pageCss.matchAll(/([^{}]+)\{[^{}]*\bcolor:[^{}]*\}/g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((selector) => /(^|\s)a(:hover)?(\s|$|\))/.test(selector));
    expect(linkRules.length).toBeGreaterThan(0);
    for (const selector of linkRules) expect(selector).toMatch(/^:where\(/);
  });

  // Needs a local Chromium (`pnpm --filter @cp/web exec playwright install chromium`); CI's
  // generic test job has no browser, so the declaration check above is the gate there.
  const hasChromium = existsSync(chromium.executablePath());

  it.skipIf(!hasChromium)(
    'measures the rendered header and final-call buttons at rest and on hover',
    async () => {
      const markup = (path: string): string => read(path).replace(/^---[\s\S]*?---/, '');
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.setContent(
          `<style>${allCss}</style><div class="cs-root">${markup('../components/site-header.astro')}${markup('../components/final-call.astro')}</div>`,
        );
        for (const selector of ['.cs-header .cs-cta', '.cs-final__cta']) {
          const measure = () =>
            page.$eval(selector, (el) => {
              const style = getComputedStyle(el);
              return { color: style.color, background: style.backgroundColor };
            });
          await page.mouse.move(0, 0);
          const rest = await measure();
          await page.hover(selector);
          const hovered = await measure();
          for (const state of [rest, hovered]) {
            expect(
              contrast(state.color, state.background),
              `${selector} ${JSON.stringify(state)}`,
            ).toBeGreaterThanOrEqual(MIN_RATIO);
          }
        }
      } finally {
        await browser.close();
      }
    },
    30_000,
  );
});
