import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generates real SDF glyph PBF ranges (MapLibre's `{fontstack}/{range}.pbf` layout) for the two
 * fontstacks the Da Nang dark style draft uses: Archivo Bold (road/POI labels) and Caveat SemiBold
 * (the hand-drawn place-name accent). Wraps `@kartore/glyphore`, a real SDF-PBF generator, against
 * the actual shipped TTFs in `apps/mobile/assets/fonts` — no placeholder glyph data.
 */
const MOBILE_FONTS_DIR = join(process.cwd(), '..', '..', 'apps/mobile/assets/fonts');

// glyphore derives each fontstack's on-disk folder name from the TTF's own name table (family +
// style), not from this list — the style JSON's `text-font` values must match those derived names
// exactly: "Archivo-W100-700 Regular" and "Caveat-600 Regular" (confirmed by running this script;
// see the ADR).
const FONTS: readonly string[] = ['Archivo-W100-700.ttf', 'Caveat-600.ttf'];

function main(): void {
  const outDir = join(process.cwd(), 'tiles', '.output', 'fonts');
  const stagingDir = join(process.cwd(), 'tiles', '.output', 'fonts-src');
  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  for (const file of FONTS) {
    cpSync(join(MOBILE_FONTS_DIR, file), join(stagingDir, file));
  }

  const glyphoreBin = join(process.cwd(), 'node_modules', '.bin', 'glyphore');
  const run = spawnSync(glyphoreBin, ['build', stagingDir, '-o', outDir], { stdio: 'inherit' });
  if (run.status !== 0) {
    throw new Error(`tiles fonts: glyphore exited with code ${String(run.status)}`);
  }

  rmSync(stagingDir, { recursive: true, force: true });
  console.log(JSON.stringify({ msg: 'tiles fonts: written', outDir }));
}

main();
