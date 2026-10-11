// Exports the app icons and launch splashes from the premium design into apps/mobile/assets,
// rendered by Chromium from design/premium/App Icon.dc.html and "CritterPass 10 Icon Splash and
// Store.dc.html" (never redrawn).
/* global document -- page callbacks run in the browser */
//   node tools/design-renders/export-app-icons.mjs
// Idempotent: every run rewrites the same files.
//
// - iOS 26: one Icon Composer bundle per icon (assets/app-icons/ios/<id>.icon). The ground is the
//   bottom group (its own image, so the design's gradients stay exact) and is hidden in the tinted
//   appearance; the art is the top group, with a dark image and the white line art as its tinted
//   image. The system draws Clear and Tinted from those; the design's gloss is left out because
//   iOS adds its own specular highlight. The primary icon gets DEV / STAGING copies.
// - Android: adaptive background + foreground + monochrome per icon. The design's 200-unit box
//   is the 72 dp mask viewport of the 108 dp canvas, with the art scaled .8 as the design draws it
//   in non-iOS shapes. The primary icon's layers go to assets/android-icon-*.png (Expo's adaptive
//   icon); the alternates' to assets/app-icons/android for cp-app-icon's launcher aliases.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

import { toMonochrome } from './app-icon-monochrome.mjs';
import { openPage } from './design-page.mjs';
import { repoRoot, serveDesign } from './serve-design.mjs';
import { exportSplashes } from './splash-renders.mjs';

const ICONS = ['passport', 'face', 'stamp', 'sticker'];
const PRIMARY = 'passport';

const assetsDir = path.join(repoRoot, 'apps/mobile/assets');
const iconsDir = path.join(assetsDir, 'app-icons');

/** Icon pixels: the design draws icons in a 200-unit box. */
const ICON_PX = 1024;
const DESIGN_BOX = 200;
/** 200 units are the 72 dp viewport, so the 108 dp canvas is 300 units. */
const ADAPTIVE_BOX = 300;
const ADAPTIVE_MARGIN = (ADAPTIVE_BOX - DESIGN_BOX) / 2;
/** Where the capture square starts on the page. */
const CAPTURE_AT = 400;

/** Pre-release builds carry a label so testers can tell them from the store app. */
const BADGES = { development: 'DEV', staging: 'STAGING' };

/** Icon Composer's `extended-srgb` literal for the solid fill under the ground image. */
const FILLS = {
  passport: { light: '#f47f2e', dark: '#21222a' },
  face: { light: '#ffd84a', dark: '#26272f' },
  stamp: { light: '#1f1c35', dark: '#17161f' },
  sticker: { light: '#4f86ff', dark: '#21222a' },
};

function iconPage(variant, mode, shape, at) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script>
<style>html,body{margin:0;background:transparent}</style></head><body><x-dc>
<div id="stage" style="position:absolute;left:${at}px;top:${at}px;line-height:0">
<dc-import name="App Icon" variant="${variant}" mode="${mode}" shape="${shape}" size="${DESIGN_BOX}"></dc-import>
</div></x-dc></body></html>`;
}

/**
 * Renders one layer of one icon.
 * - `part`: `ground` (the background, plus the passport's spine), `art` (everything in front of
 *   it), or `full` (both).
 * - `adaptive`: Android layers on the 108 dp canvas (no mask, ground bleeding to the edges, art at
 *   the design's .8 non-iOS scale); otherwise the 200-unit square.
 * - `gloss`: keep the design's gloss overlay (Android); iOS 26 adds its own.
 * - `badge`: the pre-release label, drawn alone when `part` is `badge`.
 */
async function renderIcon(browser, server, { variant, mode, part, adaptive, gloss, badge }) {
  const box = adaptive ? ADAPTIVE_BOX : DESIGN_BOX;
  const at = adaptive ? CAPTURE_AT + ADAPTIVE_MARGIN : CAPTURE_AT;
  const { context, page } = await openPage(browser, server, ICON_PX / box);
  const url = `${server.origin}/premium/__export.html`;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: iconPage(variant, mode, adaptive ? 'circle' : 'square', at),
    }),
  );
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#stage canvas').length > 0);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.evaluate(
      ({ part, adaptive, gloss, badge, margin }) => {
        const root = document.querySelector('#stage div[style*="border-radius"]');
        const scaled = root.firstElementChild;
        const [ground, art] = scaled.children;
        root.style.boxShadow = 'none';
        if (adaptive) {
          root.style.borderRadius = '0';
          root.style.overflow = 'visible';
          ground.style.inset = `-${margin}px`;
        }
        const layers = [...art.children];
        const isSpine = (el) => el.style.width === '22px';
        const isGloss = (el) => el.style.background.startsWith('linear-gradient');
        for (const el of layers) {
          if (isGloss(el) && !gloss) el.style.visibility = 'hidden';
          if (part === 'ground' && !isSpine(el)) el.style.visibility = 'hidden';
          if (part === 'art' && isSpine(el)) el.style.visibility = 'hidden';
        }
        if (part === 'art' || part === 'badge') ground.style.visibility = 'hidden';
        if (part === 'badge') art.style.visibility = 'hidden';
        if (badge) {
          const label = document.createElement('div');
          label.textContent = badge;
          Object.assign(label.style, {
            position: 'absolute',
            left: '50%',
            bottom: adaptive ? '40px' : '24px',
            transform: 'translateX(-50%)',
            padding: '4px 10px 3px',
            borderRadius: '99px',
            background: '#1c1d24',
            color: '#ffd84a',
            border: '2.5px solid #ffffff',
            font: '800 15px/1 -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
            letterSpacing: '.12em',
            whiteSpace: 'nowrap',
          });
          scaled.appendChild(label);
        }
      },
      { part, adaptive: Boolean(adaptive), gloss: Boolean(gloss), badge, margin: ADAPTIVE_MARGIN },
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({
      clip: { x: CAPTURE_AT, y: CAPTURE_AT, width: box, height: box },
      omitBackground: part !== 'full' && part !== 'ground',
    });
  } finally {
    await context.close();
  }
}

/** `#rrggbb` -> Icon Composer's `extended-srgb:r,g,b,a` literal. */
function extendedSrgb(hex) {
  const channel = (i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(5);
  return `extended-srgb:${channel(1)},${channel(3)},${channel(5)},1.00000`;
}

/**
 * Which appearances show a layer. Icon Composer specialises a layer's visibility per appearance
 * (`hidden-specializations`); image names do not specialise, so each look is its own layer.
 */
function shownIn(...appearances) {
  return [
    { value: !appearances.includes('light') },
    { appearance: 'dark', value: !appearances.includes('dark') },
    { appearance: 'tinted', value: !appearances.includes('tinted') },
  ];
}

/**
 * The Icon Composer document: the art over the ground, each with its light and dark image, and
 * the white line art alone in the tinted appearance (Clear and Tinted derive from it).
 * `darkArt` is false when the dark art is the light art.
 */
export function iconComposerDocument(id, { badge, darkArt }) {
  const fill = FILLS[id];
  const layer = (name, appearances) => ({
    name,
    'image-name': `${name}.png`,
    'hidden-specializations': shownIn(...appearances),
  });
  const group = (layers, glass) => ({
    layers,
    shadow: { kind: glass ? 'neutral' : 'none', opacity: 0.5 },
    translucency: { enabled: false, value: 0.5 },
    ...(glass ? {} : { specular: false }),
  });
  const art = darkArt
    ? [layer('art', ['light']), layer('art-dark', ['dark'])]
    : [layer('art', ['light', 'dark'])];
  const groups = [];
  if (badge) groups.push(group([{ name: 'badge', 'image-name': 'badge.png' }], false));
  groups.push(
    group([...art, layer('mono', ['tinted'])], true),
    group([layer('ground', ['light']), layer('ground-dark', ['dark'])], false),
  );
  return {
    'fill-specializations': [
      { value: { solid: extendedSrgb(fill.light) } },
      { appearance: 'dark', value: { solid: extendedSrgb(fill.dark) } },
    ],
    groups,
    'supported-platforms': { circles: [], squares: 'shared' },
  };
}

const rel = (file) => path.relative(repoRoot, file);
const write = (file, bytes) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  console.log(`wrote ${rel(file)}`);
};

async function writeIosIcon(browser, server, id) {
  const layers = {
    'ground.png': await renderIcon(browser, server, { variant: id, mode: 'light', part: 'ground' }),
    'ground-dark.png': await renderIcon(browser, server, {
      variant: id,
      mode: 'dark',
      part: 'ground',
    }),
    'art.png': await renderIcon(browser, server, { variant: id, mode: 'light', part: 'art' }),
    'art-dark.png': await renderIcon(browser, server, { variant: id, mode: 'dark', part: 'art' }),
    'mono.png': toMonochrome(
      await renderIcon(browser, server, { variant: id, mode: 'mono', part: 'art' }),
    ),
  };
  const darkArt = !layers['art.png'].equals(layers['art-dark.png']);
  if (!darkArt) delete layers['art-dark.png'];
  const variants =
    id === PRIMARY ? [['', undefined], ...Object.entries(BADGES)] : [['', undefined]];
  for (const [appVariant, badge] of variants) {
    const name = appVariant ? `${id}-${appVariant}` : id;
    const bundle = path.join(iconsDir, 'ios', `${name}.icon`);
    rmSync(bundle, { recursive: true, force: true });
    for (const [file, bytes] of Object.entries(layers)) {
      write(path.join(bundle, 'Assets', file), bytes);
    }
    if (badge) {
      write(
        path.join(bundle, 'Assets', 'badge.png'),
        await renderIcon(browser, server, { variant: id, mode: 'light', part: 'badge', badge }),
      );
    }
    write(
      path.join(bundle, 'icon.json'),
      `${JSON.stringify(iconComposerDocument(id, { badge, darkArt }), null, 2)}\n`,
    );
  }
}

async function androidLayers(browser, server, id, badge) {
  const common = { variant: id, adaptive: true, gloss: true };
  return {
    background: await renderIcon(browser, server, { ...common, mode: 'light', part: 'ground' }),
    foreground: await renderIcon(browser, server, { ...common, mode: 'light', part: 'art', badge }),
    monochrome: toMonochrome(
      await renderIcon(browser, server, { ...common, mode: 'mono', part: 'art', gloss: false }),
    ),
  };
}

/** The adaptive icon cp-app-icon's launcher alias for `slug` points at. */
export function adaptiveIconXml(slug) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by tools/design-renders/export-app-icons.mjs. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background_${slug}"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground_${slug}"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome_${slug}"/>
</adaptive-icon>
`;
}

async function writeAndroidIcons(browser, server) {
  for (const [appVariant, badge] of [['production', undefined], ...Object.entries(BADGES)]) {
    const suffix = badge ? `-${appVariant}` : '';
    const { background, foreground, monochrome } = await androidLayers(
      browser,
      server,
      PRIMARY,
      badge,
    );
    write(path.join(assetsDir, `android-icon-foreground${suffix}.png`), foreground);
    if (!badge) {
      write(path.join(assetsDir, 'android-icon-background.png'), background);
      write(path.join(assetsDir, 'android-icon-monochrome.png'), monochrome);
    }
  }
  const androidDir = path.join(iconsDir, 'android');
  rmSync(androidDir, { recursive: true, force: true });
  for (const id of ICONS.filter((icon) => icon !== PRIMARY)) {
    const slug = id.replace(/-/g, '_');
    const layers = await androidLayers(browser, server, id);
    for (const [kind, bytes] of Object.entries(layers)) {
      write(path.join(androidDir, 'drawable-xxxhdpi', `ic_launcher_${kind}_${slug}.png`), bytes);
    }
    write(
      path.join(androidDir, 'mipmap-anydpi-v26', `ic_launcher_${slug}.xml`),
      adaptiveIconXml(slug),
    );
  }
}

/** The App Store / Play listing icon and Expo's root `icon`: the full light icon, square. */
async function writeFlatIcons(browser, server) {
  for (const [appVariant, badge] of [['production', undefined], ...Object.entries(BADGES)]) {
    const suffix = badge ? `-${appVariant}` : '';
    write(
      path.join(assetsDir, `icon${suffix}.png`),
      await renderIcon(browser, server, {
        variant: PRIMARY,
        mode: 'light',
        part: 'full',
        gloss: true,
        badge,
      }),
    );
  }
}

// `--icons` or `--splash` exports only that half.
const only = ['icons', 'splash'].find((part) => process.argv.includes(`--${part}`));
const server = await serveDesign();
const browser = await chromium.launch();
try {
  if (only !== 'splash') {
    for (const id of ICONS) await writeIosIcon(browser, server, id);
    await writeAndroidIcons(browser, server);
    await writeFlatIcons(browser, server);
  }
  if (only !== 'icons') {
    const splashes = await exportSplashes(browser, server, (variant, mode) =>
      renderAndroidSplashIcon(browser, server, variant, mode),
    );
    for (const [file, bytes] of Object.entries(splashes)) write(path.join(assetsDir, file), bytes);
  }
} finally {
  await browser.close();
  server.close();
}

/** The Android 12+ splash icon: the circle icon, 160 dp at xxxhdpi, transparent around it. */
async function renderAndroidSplashIcon(browser, server, variant, mode) {
  const scale = 4;
  const { context, page } = await openPage(browser, server, scale);
  const url = `${server.origin}/premium/__export.html`;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script>
<style>html,body{margin:0;background:transparent}</style></head><body><x-dc>
<div id="stage" style="position:absolute;left:${CAPTURE_AT}px;top:${CAPTURE_AT}px;line-height:0">
<dc-import name="App Icon" variant="${variant}" mode="${mode}" shape="circle" size="160"></dc-import>
</div></x-dc></body></html>`,
    }),
  );
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#stage canvas').length > 0);
    await page.waitForTimeout(1200);
    return await page.screenshot({
      clip: { x: CAPTURE_AT, y: CAPTURE_AT, width: 160, height: 160 },
      omitBackground: true,
    });
  } finally {
    await context.close();
  }
}
