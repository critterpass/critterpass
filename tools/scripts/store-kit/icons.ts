/**
 * Store listing icons from the app's own icon art (baked by `@cp/critter-bake` into
 * `apps/mobile/assets`): the App Store marketing icon (1024 px, no alpha) and the Google Play
 * hi-res icon (512 px). The Play adaptive and themed layers ship inside the app; they are checked
 * here so the listing and the launcher never show different art.
 *
 *   pnpm tsx tools/scripts/store-kit/icons.ts [--out <dir>]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { STORE_OUT } from './capture';
import { pngInfo, withoutAlpha, type PngInfo } from './png';
import { resizeSquarePng } from './render';

const ASSETS = fileURLToPath(new URL('../../../apps/mobile/assets/', import.meta.url));

export interface IconSet {
  readonly icon: PngInfo;
  readonly adaptiveForeground: PngInfo;
  readonly adaptiveBackground: PngInfo;
  readonly monochrome: PngInfo;
}

/** What is wrong with the app's icon art for a store listing; empty when it can ship. */
export function iconIssues(set: IconSet): string[] {
  const issues: string[] = [];
  const square = (name: string, info: PngInfo, side: number): void => {
    if (info.width !== side || info.height !== side) {
      issues.push(
        `${name}: ${String(info.width)}x${String(info.height)}, needs ${String(side)}x${String(side)}`,
      );
    }
  };
  square('icon', set.icon, 1024);
  square('adaptive foreground', set.adaptiveForeground, set.adaptiveBackground.width);
  square('monochrome layer', set.monochrome, set.adaptiveBackground.width);
  if (set.adaptiveBackground.width !== set.adaptiveBackground.height) {
    issues.push('adaptive background: not square');
  }
  // The launcher masks and moves the layers: art over a transparent layer, on an opaque one.
  if (!set.adaptiveForeground.alpha) issues.push('adaptive foreground: has no transparency');
  if (!set.monochrome.alpha) issues.push('monochrome layer: has no transparency');
  if (set.adaptiveBackground.alpha) issues.push('adaptive background: must be opaque');
  return issues;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { out: { type: 'string', default: STORE_OUT } },
  });
  const read = (name: string): Buffer => readFileSync(path.join(ASSETS, name));
  const icon = read('icon.png');
  const issues = iconIssues({
    icon: pngInfo(icon),
    adaptiveForeground: pngInfo(read('android-icon-foreground.png')),
    adaptiveBackground: pngInfo(read('android-icon-background.png')),
    monochrome: pngInfo(read('android-icon-monochrome.png')),
  });
  if (issues.length > 0) throw new Error(`app icon art:\n- ${issues.join('\n- ')}`);

  const write = (file: string, bytes: Uint8Array): void => {
    mkdirSync(path.dirname(path.join(values.out, file)), { recursive: true });
    writeFileSync(path.join(values.out, file), bytes);
    console.log(`wrote ${file}`);
  };
  // App Store Connect refuses a marketing icon with an alpha channel, even a fully opaque one.
  write('app-store/icon-1024.png', withoutAlpha(icon));
  write('play/icon-512.png', await resizeSquarePng(icon, 512));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
