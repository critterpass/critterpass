import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderCardNode } from '@cp/critter-art/share';

import { optimizePng } from '../encode';
import type { AppIconDefinition } from '../templates/app-icons';
import { buildAppIconContentLayout } from '../templates/app-icons';

/** Adaptive icon foreground canvas size in px (4x the 108dp foreground layer, i.e. xxxhdpi). */
export const ANDROID_FOREGROUND_PX = 432;
/** Android's own "keep important content inside this fraction of the foreground layer" guidance (66dp safe zone inside the 108dp layer) — content outside this circle can be clipped by aggressive launcher icon masks. */
const SAFE_ZONE_RATIO = 66 / 108;

/**
 * Re-composites an already-rendered (and possibly edge-bleeding — several of this pipeline's icon
 * layouts intentionally overflow their 1024 square, matching `design/App Icon.dc.html`) content PNG
 * onto a new transparent canvas, scaled down so its full bounding square sits inside Android's 66/108
 * safe zone. `sourcePng` must already be `sizePx` x `sizePx`.
 */
async function shrinkToSafeZone(sourcePng: Uint8Array, sizePx: number): Promise<Uint8Array> {
  const canvas = createCanvas(sizePx, sizePx);
  const ctx = canvas.getContext('2d');
  const image = await loadImage(Buffer.from(sourcePng));
  const drawSize = sizePx * SAFE_ZONE_RATIO;
  const offset = (sizePx - drawSize) / 2;
  ctx.drawImage(image, offset, offset, drawSize, drawSize);
  return optimizePng(await canvas.encode('png'));
}

/**
 * Renders one icon's Android adaptive-icon set: a transparent foreground PNG (also reused, as-is,
 * for the monochrome/themed-icon layer — Android's themed-icon system only reads the *alpha*
 * channel of the drawable it's given and recolours everything from the current theme, so the same
 * foreground file is already a correct monochrome source) plus the `mipmap-anydpi-v26` XML and a
 * background colour resource.
 */
export async function writeAndroidAdaptiveIcon(
  resDir: string,
  def: AppIconDefinition,
  sizePx = ANDROID_FOREGROUND_PX,
): Promise<void> {
  const contentPng = await renderCardNode(buildAppIconContentLayout(def));
  const foregroundPng = await shrinkToSafeZone(contentPng, sizePx);

  const drawableDir = resolve(resDir, 'drawable-xxxhdpi');
  mkdirSync(drawableDir, { recursive: true });
  writeFileSync(resolve(drawableDir, `ic_launcher_foreground_${slug(def.id)}.png`), foregroundPng);

  const mipmapDir = resolve(resDir, 'mipmap-anydpi-v26');
  mkdirSync(mipmapDir, { recursive: true });
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    `    <background android:drawable="@color/ic_launcher_background_${slug(def.id)}"/>`,
    `    <foreground android:drawable="@drawable/ic_launcher_foreground_${slug(def.id)}"/>`,
    `    <monochrome android:drawable="@drawable/ic_launcher_foreground_${slug(def.id)}"/>`,
    '</adaptive-icon>',
    '',
  ].join('\n');
  writeFileSync(resolve(mipmapDir, `ic_launcher_${slug(def.id)}.xml`), xml);
}

/** Android resource names must be `[a-z0-9_]` — icon ids use `-`, so this is the one place that needs translating. */
function slug(id: string): string {
  return id.replace(/-/g, '_');
}

/** One `res/values/ic_launcher_background_colors.xml` covering every icon's adaptive-icon background colour, so `writeAndroidAdaptiveIcon` doesn't need to also own a shared values file per call. */
export function writeAndroidBackgroundColors(
  resDir: string,
  defs: readonly AppIconDefinition[],
): void {
  const valuesDir = resolve(resDir, 'values');
  mkdirSync(valuesDir, { recursive: true });
  const entries = defs
    .map(
      (def) =>
        `    <color name="ic_launcher_background_${slug(def.id)}">${def.backgroundHex}</color>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${entries}\n</resources>\n`;
  writeFileSync(resolve(valuesDir, 'ic_launcher_background_colors.xml'), xml);
}
