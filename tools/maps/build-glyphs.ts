/**
 * Generates real SDF glyph PBF ranges (MapLibre's `{fontstack}/{range}.pbf` layout) for the two
 * fontstacks `build-style.ts` references: Archivo Bold (road/POI labels) and Caveat SemiBold (the
 * hand-drawn place-name accent). Wraps `@kartore/glyphore`, a real SDF-PBF generator, against the
 * actual shipped TTFs in `apps/mobile/assets/fonts` — generalises
 * `tools/spikes/tiles/generate-fonts.ts` from a spike-local output path to this package's, no
 * behaviour change.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const MOBILE_FONTS_DIR = path.resolve(import.meta.dirname, '../../apps/mobile/assets/fonts');

// glyphore derives each fontstack's on-disk folder name from the TTF's own name table (family +
// style), not from this list — `build-style.ts`'s `text-font` values must match those derived
// names exactly: "Archivo-W100-700 Regular" and "Caveat-600 Regular" (verified by running this
// script during the tiles spike; see docs/decisions/20260927-maplibre-pmtiles-on-r2.md).
const FONTS: readonly string[] = ['Archivo-W100-700.ttf', 'Caveat-600.ttf'];

export function buildGlyphs(outDir: string): void {
  const stagingDir = path.join(outDir, '..', 'fonts-src');
  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  for (const file of FONTS) {
    cpSync(path.join(MOBILE_FONTS_DIR, file), path.join(stagingDir, file));
  }

  const glyphoreBin = path.resolve(import.meta.dirname, 'node_modules/.bin/glyphore');
  const run = spawnSync(glyphoreBin, ['build', stagingDir, '-o', outDir], { stdio: 'inherit' });
  rmSync(stagingDir, { recursive: true, force: true });
  if (run.status !== 0) {
    throw new Error(`tiles glyphs: glyphore exited with code ${String(run.status)}`);
  }
}

function main(): void {
  const outDir = path.resolve(import.meta.dirname, '.output/fonts');
  buildGlyphs(outDir);
  console.log(JSON.stringify({ msg: 'tiles glyphs: written', outDir }));
}

if (import.meta.main) main();
