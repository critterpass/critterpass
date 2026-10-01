/**
 * The live guide destinations (docs/product-decisions.md §6) and how one is written: a
 * `destinations` row per slug, inserted once and never overwritten, so an operator's catalogue edits
 * in the ops console survive a re-seed. The row's critter set is linked by the sets release (see
 * `app.sync_place_destinations`), not here.
 */
import type pg from 'pg';

export interface SeedDestination {
  readonly slug: string;
  readonly name: string;
  /** Country name as the place index spells it (`critter_sets.name`), not the ISO code. */
  readonly country: string;
  readonly currency: string;
  readonly tz: string;
  /** Months the guide recommends (1–12), shown on the destination card; null when not authored. */
  readonly bestMonths?: readonly number[];
  /**
   * `minLon,minLat,maxLon,maxLat` of the area the guide covers, stored as a one-polygon geofence;
   * the same box the POI ingest and the offline region pack use.
   */
  readonly bounds?: readonly [number, number, number, number];
}

export const DESTINATIONS: readonly SeedDestination[] = [
  { slug: 'bali', name: 'Bali', country: 'Indonesia', currency: 'IDR', tz: 'Asia/Makassar' },
  { slug: 'kyoto', name: 'Kyoto', country: 'Japan', currency: 'JPY', tz: 'Asia/Tokyo' },
  {
    slug: 'iceland',
    name: 'Iceland',
    country: 'Iceland',
    currency: 'ISK',
    tz: 'Atlantic/Reykjavik',
  },
  {
    slug: 'mexico-city',
    name: 'Mexico City',
    country: 'Mexico',
    currency: 'MXN',
    tz: 'America/Mexico_City',
  },
  { slug: 'lisbon', name: 'Lisbon', country: 'Portugal', currency: 'EUR', tz: 'Europe/Lisbon' },
  { slug: 'cusco', name: 'Cusco', country: 'Peru', currency: 'PEN', tz: 'America/Lima' },
  {
    slug: 'da-nang',
    name: 'Đà Nẵng',
    country: 'Vietnam',
    currency: 'VND',
    tz: 'Asia/Ho_Chi_Minh',
    // The dry months: warm, calm sea and the least rain. September to December is the rainy and
    // storm season (see seed/season/da-nang.json).
    bestMonths: [3, 4, 5],
    // Hải Vân pass and Sơn Trà in the north to Hội An in the south, Bà Nà hills in the west.
    bounds: [107.95, 15.84, 108.36, 16.21],
  },
];

function geofenceWkt(bounds: SeedDestination['bounds']): string | null {
  if (bounds === undefined) return null;
  const [w, s, e, n] = bounds;
  return `MULTIPOLYGON(((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s})))`;
}

/** Inserts the destinations (all, or only `slugs`) that do not exist yet; returns the new slugs. */
export async function seedDestinations(
  tx: pg.PoolClient,
  slugs?: readonly string[],
): Promise<string[]> {
  const inserted: string[] = [];
  for (const destination of DESTINATIONS) {
    if (slugs !== undefined && !slugs.includes(destination.slug)) continue;
    const { rowCount } = await tx.query(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz, best_months, geofence)
       VALUES ($1, $2, $3, 'live', $4, $5, $6, ST_GeogFromText($7))
       ON CONFLICT (slug) DO NOTHING`,
      [
        destination.slug,
        destination.name,
        destination.country,
        destination.currency,
        destination.tz,
        destination.bestMonths ?? null,
        geofenceWkt(destination.bounds),
      ],
    );
    if ((rowCount ?? 0) > 0) inserted.push(destination.slug);
  }
  return inserted;
}
