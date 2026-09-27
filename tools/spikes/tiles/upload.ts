import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { resolveCity } from './cities';

/**
 * Uploads the tiles-spike output (`build.ts`, `generate-fonts.ts`, `generate-sprite.ts`) to the
 * real `cp-tiles` R2 bucket via `wrangler r2 object put --remote` (the local-mode default writes
 * to Wrangler's simulator, not R2, and would silently produce a working-looking but fake upload).
 * Public delivery: `cp-tiles`'s r2.dev URL was enabled once via
 * `wrangler r2 bucket dev-url enable cp-tiles` (see the ADR for why public, not media-worker).
 */
const BUCKET = 'cp-tiles';

function contentTypeFor(path: string): string {
  if (path.endsWith('.pmtiles')) return 'application/octet-stream';
  if (path.endsWith('.pbf')) return 'application/x-protobuf';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function putObject(localPath: string, key: string): void {
  const run = spawnSync(
    'wrangler',
    [
      'r2',
      'object',
      'put',
      `${BUCKET}/${key}`,
      `--file=${localPath}`,
      `--content-type=${contentTypeFor(localPath)}`,
      '--remote',
    ],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) {
    throw new Error(`tiles upload: wrangler put failed for ${key} (exit ${String(run.status)})`);
  }
}

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

function parseArgs(argv: readonly string[]): { city: string } {
  const index = argv.indexOf('--city');
  const city = index === -1 ? undefined : argv[index + 1];
  if (!city) throw new Error('tiles upload: --city <name> is required (e.g. --city da-nang)');
  return { city };
}

function main(): void {
  const { city } = parseArgs(process.argv.slice(2));
  resolveCity(city); // throws on an unknown city before anything gets uploaded

  const outputRoot = join(process.cwd(), 'tiles', '.output');
  const pmtilesPath = join(outputRoot, `${city}.pmtiles`);
  putObject(pmtilesPath, `${city}/tiles.pmtiles`);

  const fontsDir = join(outputRoot, 'fonts');
  for (const file of walkFiles(fontsDir)) {
    putObject(file, `fonts/${relative(fontsDir, file)}`);
  }

  const spriteDir = join(outputRoot, 'sprite');
  for (const file of walkFiles(spriteDir)) {
    putObject(file, `sprite/${relative(spriteDir, file)}`);
  }

  const uploaded = [pmtilesPath, ...walkFiles(fontsDir), ...walkFiles(spriteDir)];
  const totalBytes = uploaded.reduce((sum, file) => sum + statSync(file).size, 0);
  console.log(
    JSON.stringify({ msg: 'tiles upload: done', city, files: uploaded.length, totalBytes }),
  );
}

main();
