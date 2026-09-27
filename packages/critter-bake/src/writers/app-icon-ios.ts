import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { renderCardNode } from '@cp/critter-art/share';
import { parseColor } from '@cp/design-tokens';

import { optimizePng } from '../encode';
import type { AppIconDefinition } from '../templates/app-icons';
import { buildAppIconContentLayout } from '../templates/app-icons';

/** `#rrggbb` -> Icon Composer's `extended-srgb:r,g,b,a` fill literal (0-1 floats, 5 decimals — matches what Icon Composer itself writes, confirmed by inspecting a real `icon.json` it saved). */
export function hexToExtendedSrgb(hex: string): string {
  const { r, g, b } = parseColor(hex);
  const channel = (value: number): string => (value / 255).toFixed(5);
  return `extended-srgb:${channel(r)},${channel(g)},${channel(b)},1.00000`;
}

/**
 * Locates Xcode 26's `ictool` (Icon Composer's export CLI, `Icon Composer.app/Contents/Executables/ictool`)
 * relative to `xcode-select -p` rather than a hardcoded `/Applications/Xcode.app` path, so this
 * still works if the active Xcode is named or located differently. Returns `undefined` off macOS or
 * when Xcode's Icon Composer isn't installed — callers use this to skip flat-fallback export
 * instead of failing a non-Xcode machine outright (CLAUDE.md's determinism note: this generated
 * output is committed from a real Mac, not regenerated in CI).
 */
export function findIctool(): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  let developerDir: string;
  try {
    developerDir = execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
  // developerDir is ".../Xcode.app/Contents/Developer"; ictool lives under the same .app's
  // sibling "Contents/Applications/Icon Composer.app".
  const xcodeAppContents = dirname(developerDir);
  const ictoolPath = resolve(
    xcodeAppContents,
    'Applications',
    'Icon Composer.app',
    'Contents',
    'Executables',
    'ictool',
  );
  return existsSync(ictoolPath) ? ictoolPath : undefined;
}

/**
 * Writes one Icon Composer `.icon` bundle: a single transparent content layer
 * (`buildAppIconContentLayout` — the character plus any chrome) over a solid `backgroundHex` fill.
 * Icon Composer/`ictool` derive the dark/tinted/clear Liquid Glass appearances from this one
 * definition at export time (verified empirically: the same `icon.json` produces visibly different
 * `Default`/`Dark`/`TintedLight`/`TintedDark` exports), so this pipeline never needs to hand-author
 * per-appearance colour tables — see `templates/app-icons.ts`'s module doc for why.
 */
export async function writeIconComposerBundle(
  destDir: string,
  def: AppIconDefinition,
): Promise<void> {
  const bundleDir = resolve(destDir, `${def.id}.icon`);
  const assetsDir = resolve(bundleDir, 'Assets');
  mkdirSync(assetsDir, { recursive: true });

  const contentPng = await optimizePng(await renderCardNode(buildAppIconContentLayout(def)));
  const imageName = `${def.id}-content.png`;
  writeFileSync(resolve(assetsDir, imageName), contentPng);

  const iconJson = {
    fill: { solid: hexToExtendedSrgb(def.backgroundHex) },
    groups: [
      {
        layers: [{ 'image-name': imageName, name: `${def.id}-content` }],
        // Icon Composer's own defaults for a freshly-added image layer (captured from a real saved
        // document, not guessed) — a light depth cue under Liquid Glass, not a fabricated value.
        shadow: { kind: 'neutral', opacity: 0.5 },
        translucency: { enabled: true, value: 0.3 },
      },
    ],
    'supported-platforms': { circles: [], squares: 'shared' },
  };
  writeFileSync(resolve(bundleDir, 'icon.json'), `${JSON.stringify(iconJson, null, 2)}\n`);
}

interface FlatRendition {
  readonly appearance: 'any' | 'dark' | 'tinted';
  readonly rendition: string;
}

// "TintedDark" (not "TintedLight"): the flat fallback only needs one tinted rendition, and the
// home-screen Tinted appearance always composites against the user's chosen dark wallpaper tint —
// TintedDark reads correctly there. TintedLight would only matter for a light-tinted control-center
// style context this app icon doesn't appear in.
const FLAT_RENDITIONS: readonly FlatRendition[] = [
  { appearance: 'any', rendition: 'Default' },
  { appearance: 'dark', rendition: 'Dark' },
  { appearance: 'tinted', rendition: 'TintedDark' },
];

/**
 * Exports the "10 x 3 flat fallbacks" (light/dark/tinted, done-when's own count) from an
 * already-written `.icon` bundle via `ictool`, into a standard `<id>.appiconset` Xcode can use
 * as-is on OSes before Icon Composer/Liquid Glass, or as the icon's flat App Store listing image.
 *
 * Left exactly as `ictool` writes them — not passed through `optimizePng` (`../encode.ts`) like
 * this pipeline's own PNGs. `ictool`'s output is 16-bit-per-channel with an embedded (Display P3)
 * ICC profile; `@napi-rs/canvas`'s decoder and sharp's decoder disagree on those bytes independently
 * of any re-encoding this function might do (confirmed by diffing sharp's raw decode against
 * `@napi-rs/canvas`'s decode of the same untouched file), so a "pixel-identical after re-encode"
 * claim can't actually be verified here with this pipeline's tools. Not worth risking a real,
 * unverifiable colour shift on the app's own App Store icon to save bytes on 30 files.
 */
export function writeFlatAppIconSet(
  bundleDir: string,
  destDir: string,
  def: AppIconDefinition,
  ictoolPath: string,
  sizePx = 1024,
): void {
  const setDir = resolve(destDir, `${def.id}.appiconset`);
  mkdirSync(setDir, { recursive: true });

  const images = FLAT_RENDITIONS.map(({ appearance, rendition }) => {
    const filename = `${def.id}-${appearance}.png`;
    const outPath = resolve(setDir, filename);
    execFileSync(ictoolPath, [
      bundleDir,
      '--export-image',
      '--output-file',
      outPath,
      '--platform',
      'iOS',
      '--rendition',
      rendition,
      '--width',
      String(sizePx),
      '--height',
      String(sizePx),
      '--scale',
      '1',
    ]);
    const image: Record<string, unknown> = {
      filename,
      idiom: 'universal',
      platform: 'ios',
      size: `${sizePx}x${sizePx}`,
    };
    if (appearance !== 'any') {
      image['appearances'] = [{ appearance: 'luminosity', value: appearance }];
    }
    return image;
  });

  const contents = { images, info: { author: 'xcode', version: 1 } };
  writeFileSync(resolve(setDir, 'Contents.json'), `${JSON.stringify(contents, null, 2)}\n`);
}
