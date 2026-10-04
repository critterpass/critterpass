/**
 * Uploads `build-style.ts`/`build-glyphs.ts`/`build-sprites.ts`/`build-pmtiles.ts` output to the
 * real `cp-tiles` R2 bucket via `wrangler r2 object put --remote` — the local-mode default writes
 * to Wrangler's simulator, not R2, and would silently produce a working-looking but fake upload
 * (the tiles spike hit exactly this; see docs/decisions/20260927-maplibre-pmtiles-on-r2.md finding
 * 4). Public delivery: `cp-tiles`'s r2.dev URL (`build-style.ts`'s `TILES_PUBLIC_BASE_URL`).
 *
 * A destination pmtiles upload also upserts its `map_regions` row (destination_id, pmtiles_key,
 * bytes, version) so `/v1/map/regions/{destination_id}` (services/api/src/places/map-regions.ts)
 * has a manifest to serve — reads `DATABASE_DIRECT_URL`, same convention as `ingest-cli.ts`. A
 * pack that is already published is refused, never replaced. This is the path from a laptop; the
 * `map regions` workflow publishes over R2's S3 API instead, and the worker's
 * `places.map_region_register` job writes the row for anything it finds on the bucket.
 */
import { createPool, withSystem } from '@cp/db';
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { TILES_PUBLIC_BASE_URL } from './build-style';

const BUCKET = 'cp-tiles';
const FONTSTACK_PUT_ATTEMPTS = 3;

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.pmtiles')) return 'application/octet-stream';
  if (filePath.endsWith('.pbf')) return 'application/x-protobuf';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.png')) return 'image/png';
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
    throw new Error(`tiles upload-r2: wrangler put failed for ${key} (exit ${String(run.status)})`);
  }
}

/** Encodes each path segment the way MapLibre requests it (a fontstack's space becomes `%20`). */
function publicUrlFor(key: string): string {
  return `${TILES_PUBLIC_BASE_URL}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Adds one fontstack's ranges without touching anything already in the bucket: a key the public
 * URL already serves is skipped, never overwritten (installed builds keep reading it). Files go
 * up one at a time with retries, since a slow uplink drops the odd request.
 */
async function uploadFontstack(fontsDir: string, fontstack: string): Promise<void> {
  const files = walkFiles(path.join(fontsDir, fontstack)).sort();
  let uploaded = 0;
  let skipped = 0;
  for (const file of files) {
    const key = `fonts/${path.relative(fontsDir, file)}`;
    const head = await fetch(publicUrlFor(key), { method: 'HEAD' });
    if (head.ok) {
      skipped += 1;
      continue;
    }
    if (head.status !== 404) {
      throw new Error(`tiles upload-r2: cannot tell whether ${key} exists (${head.status})`);
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        putObject(file, key);
        break;
      } catch (error) {
        if (attempt === FONTSTACK_PUT_ATTEMPTS) throw error;
        console.error(JSON.stringify({ msg: 'tiles upload-r2: retrying', key, attempt }));
      }
    }
    uploaded += 1;
  }
  console.log(
    JSON.stringify({ msg: 'tiles upload-r2: fontstack done', fontstack, uploaded, skipped }),
  );
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

async function upsertMapRegion(
  slug: string,
  pmtilesKey: string,
  bytes: number,
  version: string,
): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const pool = createPool({ connectionString, max: 2 });
  try {
    await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        'SELECT id FROM destinations WHERE slug = $1',
        [slug],
      );
      const destination = rows[0];
      if (destination === undefined) throw new Error(`no destination with slug "${slug}"`);
      await tx.query(
        `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (destination_id, version)
         DO UPDATE SET pmtiles_key = excluded.pmtiles_key, bytes = excluded.bytes, updated_at = now()`,
        [destination.id, pmtilesKey, bytes, version],
      );
    });
  } finally {
    await pool.end();
  }
}

interface CliArgs {
  readonly target: 'fonts' | 'sprite' | 'world' | 'region';
  readonly destination?: string;
  readonly fontstack?: string;
  readonly version: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const version = get('--version') ?? 'v1';
  const fontstack = get('--fontstack');
  if (fontstack) return { target: 'fonts', fontstack, version };
  if (argv.includes('--fonts')) return { target: 'fonts', version };
  if (argv.includes('--sprite')) return { target: 'sprite', version };
  if (argv.includes('--world')) return { target: 'world', version };
  const destination = get('--destination');
  if (!destination) {
    throw new Error(
      'tiles upload-r2: one of --fonts, --fontstack <name>, --sprite, --world, or --destination <slug> is required',
    );
  }
  return { target: 'region', destination, version };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(import.meta.dirname, '.output');

  if (args.target === 'fonts') {
    const fontsDir = path.join(outputRoot, 'fonts');
    if (args.fontstack !== undefined) {
      await uploadFontstack(fontsDir, args.fontstack);
      return;
    }
    const files = walkFiles(fontsDir);
    for (const file of files) putObject(file, `fonts/${path.relative(fontsDir, file)}`);
    console.log(JSON.stringify({ msg: 'tiles upload-r2: fonts done', files: files.length }));
    return;
  }

  if (args.target === 'sprite') {
    const spriteDir = path.join(outputRoot, 'sprite');
    const files = walkFiles(spriteDir);
    for (const file of files) putObject(file, `sprite/${path.relative(spriteDir, file)}`);
    console.log(JSON.stringify({ msg: 'tiles upload-r2: sprite done', files: files.length }));
    return;
  }

  if (args.target === 'world') {
    const pmtilesPath = path.join(outputRoot, 'world.pmtiles');
    const key = `world/tiles-${args.version}.pmtiles`;
    putObject(pmtilesPath, key);
    console.log(JSON.stringify({ msg: 'tiles upload-r2: world done', key }));
    return;
  }

  const destination = args.destination;
  if (destination === undefined) {
    throw new Error('tiles upload-r2: --destination <slug> is required in region mode');
  }
  const pmtilesPath = path.join(outputRoot, `${destination}.pmtiles`);
  const key = `${destination}/tiles-${args.version}.pmtiles`;
  // A published pack is never replaced (installed apps and downloads in flight read it): a rebuilt
  // pack goes up beside it under the next version.
  const head = await fetch(publicUrlFor(key), { method: 'HEAD' });
  if (head.ok) {
    throw new Error(`tiles upload-r2: ${key} is already published; pass the next --version`);
  }
  if (head.status !== 404) {
    throw new Error(`tiles upload-r2: cannot tell whether ${key} exists (${String(head.status)})`);
  }
  putObject(pmtilesPath, key);
  const bytes = statSync(pmtilesPath).size;
  await upsertMapRegion(destination, key, bytes, args.version);
  console.log(JSON.stringify({ msg: 'tiles upload-r2: region done', destination, key, bytes }));
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
