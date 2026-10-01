// Exports the app icon and launch splash from the design into apps/mobile/assets, rendered by
// Chromium from design/App Icon.dc.html and design/Critterpass Store Assets.dc.html (never redrawn).
/* global document -- page callbacks run in the browser */
//   node tools/design-renders/export-app-icons.mjs [--variant face|passport|stamp|sticker]
// Idempotent: every run rewrites the same files. The variant is the store-assets icon direction.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { toMonochrome } from './app-icon-monochrome.mjs';
import { openPage } from './design-page.mjs';
import { repoRoot, serveDesign } from './serve-design.mjs';
import { renderLaunch, renderWobble, wobbleDrawable } from './splash-renders.mjs';

const ICON_VARIANTS = ['face', 'passport', 'stamp', 'sticker'];
const { values } = parseArgs({ options: { variant: { type: 'string', default: 'face' } } });
const variant = values.variant ?? 'face';
if (!ICON_VARIANTS.includes(variant)) {
  throw new Error(`--variant must be one of ${ICON_VARIANTS.join(', ')}`);
}

const assetsDir = path.join(repoRoot, 'apps/mobile/assets');
const wobbleDir = path.join(assetsDir, 'splash-android-wobble');

/**
 * Icon pixels. The design draws icons in a 200-unit box. On Android that box is the 66 dp safe
 * circle's square, so masks of any shape keep the whole face; the layers fill the 108 dp canvas.
 */
const ICON_PX = 1024;
const DESIGN_BOX = 200;
/** 200 of 330 units is 65.5 dp of 108; screenshot clips are whole CSS pixels. */
const ADAPTIVE_BOX = 330;
const ADAPTIVE_MARGIN = (ADAPTIVE_BOX - DESIGN_BOX) / 2;
/** Where the capture square starts on the page. */
const CAPTURE_AT = 400;

/** Pre-release builds carry a label so testers can tell them from the store app. */
const BADGES = { development: 'DEV', staging: 'STAGING' };

function iconPage(mode, shape, at) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script>
<style>html,body{margin:0;background:transparent}</style></head><body><x-dc>
<div id="stage" style="position:absolute;left:${at}px;top:${at}px;line-height:0">
<dc-import name="App Icon" variant="${variant}" mode="${mode}" shape="${shape}" size="${DESIGN_BOX}"></dc-import>
</div></x-dc></body></html>`;
}

/**
 * Renders one App Icon mode. `layer` picks the Android adaptive layers (the art or the dot ground
 * on the 108 dp canvas, no mask); `badge` adds the pre-release label.
 */
async function renderIcon(browser, server, { mode, layer, badge }) {
  const adaptive = layer !== undefined;
  const box = adaptive ? ADAPTIVE_BOX : DESIGN_BOX;
  const { context, page } = await openPage(
    browser,
    server,
    ICON_PX / box,
    iconPage(
      mode,
      adaptive ? 'circle' : 'none',
      adaptive ? CAPTURE_AT + ADAPTIVE_MARGIN : CAPTURE_AT,
    ),
  );
  try {
    await page.goto(`${server.origin}/__export.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#stage canvas').length > 0);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.evaluate(
      ({ mode, layer, badge, margin }) => {
        const root = document.querySelector('#stage div[style*="border-radius"]');
        const scaled = root.firstElementChild;
        const [ground, art, tint] = scaled.children;
        // The tinted mode's yellow wash previews the system tint; the exported layer is the grey art.
        if (mode === 'tinted' && tint) tint.remove();
        root.style.boxShadow = 'none';
        if (layer !== undefined) {
          root.style.borderRadius = '0';
          root.style.overflow = 'visible';
          Object.assign(ground.style, { inset: `-${margin}px` });
          if (layer === 'foreground') ground.style.visibility = 'hidden';
          if (layer === 'background') art.style.visibility = 'hidden';
        }
        if (badge) {
          const tinted = mode === 'tinted';
          const label = document.createElement('div');
          label.textContent = badge;
          Object.assign(label.style, {
            position: 'absolute',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            padding: '4px 10px 3px',
            borderRadius: '99px',
            background: tinted ? '#141414' : '#17142a',
            color: tinted ? '#e6e6e6' : '#ffd84a',
            border: `2.5px solid ${tinted ? '#bdbdbd' : '#f4efe4'}`,
            font: '900 15px/1 Archivo, sans-serif',
            fontStretch: '80%',
            letterSpacing: '.12em',
            whiteSpace: 'nowrap',
          });
          scaled.appendChild(label);
        }
      },
      { mode, layer, badge, margin: ADAPTIVE_MARGIN },
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({
      clip: { x: CAPTURE_AT, y: CAPTURE_AT, width: box, height: box },
      omitBackground: layer === 'foreground',
    });
  } finally {
    await context.close();
  }
}

const write = (name, bytes) => {
  writeFileSync(path.join(assetsDir, name), bytes);
  console.log(`wrote apps/mobile/assets/${name}`);
};

const server = await serveDesign();
const browser = await chromium.launch();
try {
  for (const [appVariant, badge] of [['production', undefined], ...Object.entries(BADGES)]) {
    const suffix = badge ? `-${appVariant}` : '';
    for (const mode of ['light', 'dark', 'tinted']) {
      const name = mode === 'light' ? `icon${suffix}.png` : `icon${suffix}-${mode}.png`;
      write(name, await renderIcon(browser, server, { mode, badge }));
    }
    write(
      `android-icon-foreground${suffix}.png`,
      await renderIcon(browser, server, { mode: 'light', layer: 'foreground', badge }),
    );
  }
  write(
    'android-icon-background.png',
    await renderIcon(browser, server, { mode: 'light', layer: 'background' }),
  );
  write(
    'android-icon-monochrome.png',
    toMonochrome(await renderIcon(browser, server, { mode: 'mono', layer: 'foreground' })),
  );

  const { launch, eggOnly, glow } = await renderLaunch(browser, server);
  write('splash-launch.png', launch);
  write('splash-egg.png', eggOnly);
  write('splash-glow.png', glow);

  const frames = await renderWobble(browser, server);
  rmSync(wobbleDir, { recursive: true, force: true });
  mkdirSync(wobbleDir, { recursive: true });
  frames.forEach((png, i) =>
    writeFileSync(path.join(wobbleDir, `splash_egg_wobble_${String(i).padStart(2, '0')}.png`), png),
  );
  write('splash-android-wobble.xml', wobbleDrawable(frames.length));
  console.log(`wrote ${readdirSync(wobbleDir).length} wobble frames`);
} finally {
  await browser.close();
  server.close();
}
