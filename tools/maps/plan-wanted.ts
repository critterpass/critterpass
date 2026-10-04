/**
 * Plans a scheduled `map regions` run: asks the api which destinations are waiting for a region
 * pack (`GET /v1/map/regions/wanted`, slugs and boxes only) and decides which of them this run
 * builds. A destination is built when its Geofabrik extract is known, its box is under the size
 * cap, and no pack answers at its public address yet (the worker may not have registered a pack
 * an earlier run published). The rest are named with the reason, for the run's summary.
 *
 *   pnpm --filter @cp/maps plan:wanted --api https://<api host> --limit 6 [--out plan.json]
 *
 * Prints `{ build: [{ slug, bounds, geofabrikRegion }], skipped: [{ slug, reason }] }`.
 */
import { writeFileSync } from 'node:fs';

// The extract each destination is cut from, kept by the routing tiles (one list for both builds).
import { REGION_BY_SLUG } from '../routing-tiles/src/regions';
import { TILES_PUBLIC_BASE_URL } from './build-style';

/** About Iceland's pack (the largest built so far, 40 MB): a wider box waits for a person. */
export const MAX_BOX_KM2 = 20_000;
const KM_PER_DEGREE = 111.32;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type Bounds = readonly [number, number, number, number];

export interface WantedPlan {
  readonly build: { slug: string; bounds: string; geofabrikRegion: string }[];
  readonly skipped: { slug: string; reason: string }[];
}

export function boxKm2([minLon, minLat, maxLon, maxLat]: Bounds): number {
  const middle = ((minLat + maxLat) / 2) * (Math.PI / 180);
  return (maxLon - minLon) * KM_PER_DEGREE * Math.cos(middle) * (maxLat - minLat) * KM_PER_DEGREE;
}

function isBounds(value: unknown): value is Bounds {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  const [minLon, minLat, maxLon, maxLat] = value as number[] as [number, number, number, number];
  return (
    minLon < maxLon &&
    minLat < maxLat &&
    minLon >= -180 &&
    maxLon <= 180 &&
    minLat >= -90 &&
    maxLat <= 90
  );
}

/**
 * `packStatus` answers the HTTP status of a slug's first pack at its public address: 404 means
 * there is none; 200 means one is published; anything else leaves the slug for the next run.
 */
export async function planWanted(
  regions: readonly unknown[],
  limit: number,
  packStatus: (slug: string) => Promise<number>,
): Promise<WantedPlan> {
  const plan: WantedPlan = { build: [], skipped: [] };
  for (const entry of regions) {
    if (plan.build.length >= limit) break;
    const { slug, bounds } = (entry ?? {}) as { slug?: unknown; bounds?: unknown };
    if (typeof slug !== 'string' || !SLUG.test(slug) || !isBounds(bounds)) {
      plan.skipped.push({ slug: String(slug).slice(0, 60), reason: 'not a slug and a box' });
      continue;
    }
    const geofabrikRegion = REGION_BY_SLUG[slug];
    if (geofabrikRegion === undefined) {
      plan.skipped.push({
        slug,
        reason: 'no Geofabrik extract on record (tools/routing-tiles/src/regions.ts)',
      });
      continue;
    }
    const km2 = Math.round(boxKm2(bounds));
    if (km2 > MAX_BOX_KM2) {
      plan.skipped.push({
        slug,
        reason: `box is ${String(km2)} km², over the ${String(MAX_BOX_KM2)} km² cap`,
      });
      continue;
    }
    const status = await packStatus(slug);
    if (status === 200) {
      plan.skipped.push({ slug, reason: 'a pack is already published; the worker registers it' });
      continue;
    }
    if (status !== 404) {
      plan.skipped.push({
        slug,
        reason: `cannot tell whether a pack exists (HTTP ${String(status)})`,
      });
      continue;
    }
    plan.build.push({ slug, bounds: bounds.join(','), geofabrikRegion });
  }
  return plan;
}

async function publishedPackStatus(slug: string): Promise<number> {
  try {
    const response = await fetch(`${TILES_PUBLIC_BASE_URL}/${slug}/tiles-v1.pmtiles`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20_000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const get = (flag: string): string | undefined => {
    const index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const api = get('--api')?.replace(/\/+$/u, '');
  if (!api) throw new Error('tiles plan-wanted: --api <api base url> is required');
  const limit = Number(get('--limit') ?? '6');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error('tiles plan-wanted: --limit takes a whole number from 1 to 20');
  }
  // Ask for more than the run builds: some of the list may be skipped.
  const response = await fetch(`${api}/v1/map/regions/wanted?limit=20`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`tiles plan-wanted: the api answered ${String(response.status)}`);
  const body = (await response.json()) as { regions?: unknown };
  const regions = Array.isArray(body.regions) ? body.regions : [];
  const plan = await planWanted(regions, limit, publishedPackStatus);
  const json = JSON.stringify(plan);
  const out = get('--out');
  if (out !== undefined) writeFileSync(out, json);
  console.log(json);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
