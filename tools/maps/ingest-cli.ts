/**
 * Manual/staging POI ingest trigger. No pg-boss `poi.ingest` job runner exists yet, so this CLI is
 * the actual mechanism for a monthly/on-demand ingest until that job is wired up:
 *
 *   pnpm --filter @cp/maps ingest -- --slug kyoto --min-lat 34.90 --max-lat 35.10 \
 *     --min-lng 135.60 --max-lng 135.85 --tz Asia/Tokyo
 *
 * `--slug` must match an existing `destinations.slug`. Reads `DATABASE_DIRECT_URL` (same variable
 * the worker/migration runner use) from the environment.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { createPool, withSystem } from '@cp/db';

import {
  generateAttributionNotice,
  ingestDestination,
} from '../../services/worker/src/places/ingest';

interface CliArgs {
  readonly slug: string;
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
  readonly tz: string | undefined;
}

function parseArgs(rawArgv: readonly string[]): CliArgs {
  // pnpm forwards a literal `--` before script args (`pnpm run ingest -- --slug x` becomes
  // `tsx ingest-cli.ts -- --slug x`); drop it so it is never mistaken for a flag name.
  const argv = rawArgv.filter((token) => token !== '--');
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token?.startsWith('--') && token.length > 2) {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`missing value for ${token}`);
      values.set(token.slice(2), value);
      index += 1;
    }
  }

  const slug = values.get('slug');
  const minLat = values.get('min-lat');
  const maxLat = values.get('max-lat');
  const minLng = values.get('min-lng');
  const maxLng = values.get('max-lng');
  if (
    slug === undefined ||
    minLat === undefined ||
    maxLat === undefined ||
    minLng === undefined ||
    maxLng === undefined
  ) {
    throw new Error(
      'usage: ingest-cli --slug <destination-slug> --min-lat <n> --max-lat <n> --min-lng <n> --max-lng <n> [--tz <iana-tz>]',
    );
  }
  return {
    slug,
    minLat: Number(minLat),
    maxLat: Number(maxLat),
    minLng: Number(minLng),
    maxLng: Number(maxLng),
    tz: values.get('tz'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const connectionString = process.env['DATABASE_DIRECT_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');

  const pool = createPool({ connectionString, max: 2 });
  try {
    const destinationId = await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        'SELECT id FROM destinations WHERE slug = $1',
        [args.slug],
      );
      const row = rows[0];
      if (row === undefined) throw new Error(`no destination with slug "${args.slug}"`);
      return row.id;
    });

    const result = await ingestDestination(pool, {
      destinationId,
      bbox: { minLat: args.minLat, maxLat: args.maxLat, minLng: args.minLng, maxLng: args.maxLng },
      ...(args.tz !== undefined ? { timezone: args.tz } : {}),
    });

    console.log(
      JSON.stringify(
        {
          slug: args.slug,
          upserted: result.upserted,
          activeCount: result.activeCount,
          sparseCoverage: result.sparseCoverage,
          fsqOsGated: result.fsqOsGated,
        },
        null,
        2,
      ),
    );

    const attributionDir = path.resolve(import.meta.dirname, 'attribution');
    await mkdir(attributionDir, { recursive: true });
    const notice = generateAttributionNotice({
      destinationSlug: args.slug,
      overtureRelease: process.env['OVERTURE_RELEASE'] ?? '2026-09-23.1',
      fsqOsIncluded: !result.fsqOsGated,
      generatedAt: new Date(),
    });
    await writeFile(path.join(attributionDir, `${args.slug}.NOTICE.md`), notice, 'utf8');
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
