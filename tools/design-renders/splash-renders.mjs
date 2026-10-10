// The launch renders, captured from design/premium/"CritterPass 10 Icon Splash and Store.dc.html":
// the iOS launch images (10.01 light, 10.03 dark) with the two layers the in-app launch animation
// draws on top of them (the glow and the passport cover), and the Android 12+ splash icon and
// branding wordmark (10.04 light, 10.05 dark).
/* global document -- page callbacks run in the browser */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { openPage } from './design-page.mjs';
import { repoRoot } from './serve-design.mjs';

const PART_10 = 'premium/CritterPass 10 Icon Splash and Store.dc.html';
/** The launch image is a square centred on the screen; 736 pt holds the whole glow. */
export const SPLASH_PT = 736;
const SPLASH_SCALE = 3;
/** Room around the cover for its drop shadow in the cover-only layer. */
export const COVER_PAD = 80;
/** Android draws the branding image in a 200 × 80 dp box; the wordmark sits on its bottom edge. */
const BRAND_DP = { width: 200, height: 80 };
const ANDROID_SCALE = 4;

const BOREL = readFileSync(path.join(repoRoot, 'apps/mobile/assets/fonts/Borel-400.ttf'));

/** Serves Borel locally instead of from Google Fonts, so exports never depend on the network. */
async function routeBorel(page, origin) {
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'text/css',
      body: `@font-face{font-family:'Borel';font-style:normal;font-weight:400;src:url(${origin}/__borel.ttf) format('truetype');}`,
    }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.route(`${origin}/__borel.ttf`, (route) =>
    route.fulfill({ contentType: 'font/ttf', body: BOREL }),
  );
}

/**
 * Captures one launch phone (`10.01` or `10.03`): the glow is re-pinned to absolute pixels (its
 * radial size is a percentage of the 390 × 844 phone) and widened to a centred 736 pt square, and
 * everything but the glow and the cover is hidden.
 */
async function renderLaunchPhone(browser, server, code) {
  const { context, page } = await openPage(browser, server, SPLASH_SCALE);
  await routeBorel(page, server.origin);
  try {
    await page.goto(`${server.origin}/${encodeURIComponent(PART_10).replace('%2F', '/')}`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await page.waitForFunction(
      (c) =>
        [...document.querySelectorAll('b')].some(
          (b) => b.textContent === c && b.closest('div')?.parentElement?.querySelector('canvas'),
        ),
      code,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    // The 736 pt square is wider than the phone: give it room on the left of the page.
    await page.setViewportSize({ width: 2400, height: 1400 });
    await page.evaluate(() => (document.body.style.paddingLeft = '400px'));
    const found = await page.evaluate(
      ({ code, side }) => {
        const caption = [...document.querySelectorAll('b')].find((b) => b.textContent === code);
        const holder = caption.closest('div').parentElement;
        const frame = [...holder.querySelectorAll('div')].find(
          (d) => d.style.width === '390px' && d.style.height === '844px',
        );
        const cover = [...frame.querySelectorAll('div')].find(
          (d) => d.style.left === '95px' && d.style.top === '291px',
        );
        const glow = [...frame.querySelectorAll('div')].find((d) =>
          d.style.background.startsWith('radial-gradient'),
        );
        if (!cover || !glow) throw new Error(`launch phone ${code}: no cover or glow`);
        for (const el of document.body.querySelectorAll('*')) {
          const keep =
            el.contains(glow) || el.contains(cover) || glow.contains(el) || cover.contains(el);
          if (!keep) el.style.visibility = 'hidden';
        }
        for (let el = glow.parentElement; el; el = el.parentElement) {
          Object.assign(el.style, { overflow: 'visible', boxShadow: 'none', filter: 'none' });
          el.style.background = 'transparent';
        }
        const m = /radial-gradient\(([\d.]+)% ([\d.]+)%(?: at [^,]+)?, (.*)\)$/.exec(
          glow.style.background,
        );
        if (!m) throw new Error(`unexpected glow: ${glow.style.background}`);
        const box = frame.getBoundingClientRect();
        const rx = (+m[1] / 100) * box.width;
        const ry = (+m[2] / 100) * box.height;
        Object.assign(glow.style, {
          inset: 'auto',
          left: `${(box.width - side) / 2}px`,
          top: `${(box.height - side) / 2}px`,
          width: `${side}px`,
          height: `${side}px`,
          background: `radial-gradient(${rx}px ${ry}px at 50% 50%, ${m[3]})`,
        });
        glow.setAttribute('data-launch', 'glow');
        cover.setAttribute('data-launch', 'cover');
        return true;
      },
      { code, side: SPLASH_PT },
    );
    if (!found) throw new Error(`launch phone ${code} not found`);
    const glow = page.locator('[data-launch="glow"]');
    const cover = page.locator('[data-launch="cover"]');
    await glow.scrollIntoViewIfNeeded();
    const g = await glow.boundingBox();
    const square = { x: g.x, y: g.y, width: SPLASH_PT, height: SPLASH_PT };
    const launch = await page.screenshot({ clip: square });
    await cover.evaluate((el) => (el.style.visibility = 'hidden'));
    const glowOnly = await page.screenshot({ clip: square });
    await cover.evaluate((el) => (el.style.visibility = 'visible'));
    await glow.evaluate((el) => (el.style.visibility = 'hidden'));
    const c = await cover.boundingBox();
    const coverOnly = await page.screenshot({
      clip: {
        x: c.x - COVER_PAD,
        y: c.y - COVER_PAD,
        width: 200 + COVER_PAD * 2,
        height: 262 + COVER_PAD * 2,
      },
      omitBackground: true,
    });
    return { launch, glowOnly, coverOnly };
  } finally {
    await context.close();
  }
}

/** The Android splash branding: Borel 22 "CritterPass" on the bottom edge of a 200 × 80 dp box. */
async function renderBrand(browser, server, colour) {
  const { context, page } = await openPage(browser, server, ANDROID_SCALE);
  await routeBorel(page, server.origin);
  const url = `${server.origin}/premium/__brand.html`;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Borel&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:transparent}</style></head><body>
<div id="brand" style="position:absolute;left:0;top:0;width:${BRAND_DP.width}px;height:${BRAND_DP.height}px;display:flex;align-items:flex-end;justify-content:center;">
<span style="font-family:Borel,cursive;font-size:22px;line-height:1.2;color:${colour};">CritterPass</span>
</div></body></html>`,
    }),
  );
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    return await page.screenshot({
      clip: { x: 0, y: 0, ...BRAND_DP },
      omitBackground: true,
    });
  } finally {
    await context.close();
  }
}

/**
 * Every launch file, keyed by its path under apps/mobile/assets. `renderAndroidIcon` draws the
 * App Icon in the circle shape (10.04 uses the light icon, 10.05 the dark one).
 */
export async function exportSplashes(browser, server, renderAndroidIcon) {
  const light = await renderLaunchPhone(browser, server, '10.01');
  const dark = await renderLaunchPhone(browser, server, '10.03');
  return {
    'launch/splash-ios.png': light.launch,
    'launch/splash-ios-dark.png': dark.launch,
    'launch/glow.png': light.glowOnly,
    'launch/glow-dark.png': dark.glowOnly,
    'launch/cover.png': light.coverOnly,
    'launch/cover-dark.png': dark.coverOnly,
    'launch/android-icon.png': await renderAndroidIcon('passport', 'light'),
    'launch/android-icon-dark.png': await renderAndroidIcon('passport', 'dark'),
    'launch/android-brand.png': await renderBrand(browser, server, '#ff9a4d'),
    'launch/android-brand-dark.png': await renderBrand(browser, server, '#ffd84a'),
  };
}
