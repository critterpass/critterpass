/**
 * A destination's picks behind its brief: the brief's essentials and eateries first (the rows
 * they resolved to), then the best open-data rows by quality, shared out across kinds of place so
 * food cannot fill the list. One row per place: two rows are the same place when their names fold
 * to the same words, or when they sit within about 150 m of each other and most of their words
 * overlap; the earlier row (a named one, else the better one) is kept. Ranks are written 1..N and
 * a re-run replaces them.
 */
import { LOW_QUALITY, QUALITY_SCORE } from '@cp/db';
import { nameAliases } from '@cp/planner';
import type pg from 'pg';

import { CANDIDATE_COLUMNS, candidateOf, type CandidateRow } from '../pick/candidates';
import type { PickCandidate } from '../pick/match';

/** Picks per destination, named and filled together. */
export const PICK_TARGET = 250;

export const PICK_BUCKETS = ['sights', 'food', 'cafe', 'market', 'nightlife', 'shopping'] as const;
export type PickBucket = (typeof PICK_BUCKETS)[number];

/** Each bucket's share of the fill; what a bucket cannot fill goes to the others in turn. */
export const BUCKET_SHARE: Readonly<Record<PickBucket, number>> = {
  sights: 0.36,
  food: 0.22,
  cafe: 0.14,
  market: 0.06,
  nightlife: 0.1,
  shopping: 0.12,
};

export interface RankedPick {
  readonly id: string;
  readonly rank: number;
  readonly source: 'named' | 'fill';
}

const SAME_PLACE_M = 150;
const NAME_OVERLAP = 0.6;

interface Folded {
  readonly row: PickCandidate;
  readonly names: readonly string[];
  readonly tokens: ReadonlySet<string>;
}

function fold(row: PickCandidate): Folded {
  const aliases = [row.name, row.nameLocal ?? '']
    .filter((name) => name.length > 0)
    .flatMap((name) => nameAliases(name).primary);
  return {
    row,
    names: aliases.map((alias) => alias.join(' ')),
    tokens: new Set(aliases.flat()),
  };
}

function metresBetween(a: PickCandidate, b: PickCandidate): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const token of a) if (b.has(token)) both += 1;
  return both / Math.min(a.size, b.size);
}

function samePlace(a: Folded, b: Folded): boolean {
  if (a.names.some((name) => b.names.includes(name))) return true;
  return metresBetween(a.row, b.row) <= SAME_PLACE_M && overlap(a.tokens, b.tokens) >= NAME_OVERLAP;
}

/** Rows that are not the same place as an earlier row, in the order given. */
export function dedupePlaces<T extends PickCandidate>(rows: readonly T[]): T[] {
  const kept: Folded[] = [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const folded = fold(row);
    if (kept.some((other) => samePlace(other, folded))) continue;
    kept.push(folded);
    out.push(row);
  }
  return out;
}

/**
 * Ranks the picks 1..N: `named` in their order, then the fill, one bucket at a time in turn (so
 * the first page of picks is already a mix), each bucket up to its share of what the named places
 * left of `target`. `fill` holds each bucket's rows, best first.
 */
export function rankPicks(
  named: readonly PickCandidate[],
  fill: Readonly<Record<PickBucket, readonly PickCandidate[]>>,
  target: number = PICK_TARGET,
): RankedPick[] {
  const head = dedupePlaces(named).slice(0, target);
  const room = Math.max(0, target - head.length);
  // One pass over everything keeps a fill row out when a named row, or a better fill row of any
  // bucket, is the same place.
  const bucketOf = new Map<string, PickBucket>();
  for (const bucket of PICK_BUCKETS) {
    for (const row of fill[bucket]) if (!bucketOf.has(row.id)) bucketOf.set(row.id, bucket);
  }
  const taken = new Set(head.map((row) => row.id));
  const interleaved: PickCandidate[] = [];
  const longest = Math.max(0, ...PICK_BUCKETS.map((bucket) => fill[bucket].length));
  for (let at = 0; at < longest; at += 1) {
    for (const bucket of PICK_BUCKETS) {
      const row = fill[bucket][at];
      if (row !== undefined && bucketOf.get(row.id) === bucket) interleaved.push(row);
    }
  }
  const distinct = dedupePlaces([...head, ...interleaved]).filter((row) => !taken.has(row.id));
  const queues = new Map<PickBucket, PickCandidate[]>(PICK_BUCKETS.map((b) => [b, []]));
  for (const row of distinct) queues.get(bucketOf.get(row.id) as PickBucket)?.push(row);
  const quota = new Map<PickBucket, number>(
    PICK_BUCKETS.map((bucket) => [bucket, Math.max(1, Math.round(room * BUCKET_SHARE[bucket]))]),
  );
  const filled: PickCandidate[] = [];
  // First within each bucket's share, then whatever is left, still in turn.
  for (const capped of [true, false]) {
    let moved = true;
    while (filled.length < room && moved) {
      moved = false;
      for (const bucket of PICK_BUCKETS) {
        if (filled.length >= room) break;
        const left = quota.get(bucket) ?? 0;
        if (capped && left <= 0) continue;
        const row = queues.get(bucket)?.shift();
        if (row === undefined) continue;
        quota.set(bucket, left - 1);
        filled.push(row);
        moved = true;
      }
    }
  }
  return [
    ...head.map((row, index) => ({ id: row.id, rank: index + 1, source: 'named' as const })),
    ...filled.map((row, index) => ({
      id: row.id,
      rank: head.length + index + 1,
      source: 'fill' as const,
    })),
  ];
}

/** Rows read per bucket for each seat it may fill (dedupe drops some). */
export const FILL_OVERSAMPLE = 3;

/** A food row whose name says coffee or tea: the open data has no cafe category. */
const CAFE_NAME = String.raw`(^|[^a-z])(cafe|coffee|caphe|ca phe|kafe|kopi|roastery|roasters|tea|tiem tra)([^a-z]|$)`;

const BUCKET_FILTER: Readonly<Record<PickBucket, string>> = {
  sights: `p.category IN ('temple_shrine', 'museum', 'nature', 'beach')`,
  food: `p.category = 'food' AND app.unaccent_immutable(lower(p.name)) !~ '${CAFE_NAME}'`,
  cafe: `p.category = 'food' AND app.unaccent_immutable(lower(p.name)) ~ '${CAFE_NAME}'`,
  market: `p.category = 'market'`,
  nightlife: `p.category = 'nightlife'`,
  shopping: `p.category = 'shopping'`,
};

/** The kinds of place any bucket holds; the others are never read for the fill. */
const FILL_CATEGORIES = [
  'temple_shrine',
  'museum',
  'nature',
  'beach',
  'food',
  'market',
  'nightlife',
  'shopping',
];

/**
 * How many of a destination's best open-data rows the fill looks at. A metro's catalogue holds
 * a few hundred thousand rows; reading each one per bucket ran past the statement timeout. The
 * fill reads the best rows once, in the order `pois_destination_browse_idx` keeps them, and
 * splits them into buckets: a bucket's places below the best ten thousand would never
 * make the list anyway.
 */
export const FILL_SCAN = 10_000;

const BUCKET_OF = `CASE ${PICK_BUCKETS.map(
  (bucket) => `WHEN ${BUCKET_FILTER[bucket]} THEN '${bucket}'`,
).join(' ')} END`;

/** Each bucket's best open-data rows: quality first, then the rows that say more about themselves. */
export async function loadFill(
  tx: pg.PoolClient,
  destinationId: string,
  perBucket: number,
  scan: number = FILL_SCAN,
): Promise<Record<PickBucket, PickCandidate[]>> {
  const { rows } = await tx.query<CandidateRow & { bucket: PickBucket }>(
    `WITH best AS (
       SELECT ${CANDIDATE_COLUMNS}, ${BUCKET_OF} AS bucket,
              (jsonb_path_exists(p.hours, '$.weekly.*[*]'))::int + (p.website IS NOT NULL)::int
                + (p.phone IS NOT NULL)::int AS detail
         FROM pois p
        WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
          AND p.curation <> 'editorial' AND NOT ${LOW_QUALITY} AND p.brand IS NULL
          AND p.category = ANY($3::text[])
        ORDER BY (p.curation = 'editorial') DESC, ${QUALITY_SCORE} DESC
        LIMIT $4
     ), ranked AS (
       SELECT best.*,
              row_number() OVER (PARTITION BY bucket ORDER BY quality DESC, detail DESC, id) AS n
         FROM best WHERE bucket IS NOT NULL
     )
     SELECT * FROM ranked WHERE n <= $2 ORDER BY bucket, n`,
    [destinationId, perBucket, FILL_CATEGORIES, scan],
  );
  const fill = Object.fromEntries(PICK_BUCKETS.map((bucket) => [bucket, []])) as unknown as Record<
    PickBucket,
    PickCandidate[]
  >;
  for (const row of rows) fill[row.bucket].push(candidateOf(row));
  return fill;
}

/** Replaces the destination's ranks with `picks`; one writer at a time per destination. */
export async function writePicks(
  tx: pg.PoolClient,
  destinationId: string,
  picks: readonly RankedPick[],
): Promise<void> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('places.pick:' || $1, 0))`, [
    destinationId,
  ]);
  const ids = picks.map((pick) => pick.id);
  await tx.query(
    `UPDATE pois SET pick_rank = NULL, pick_source = NULL
      WHERE destination_id = $1 AND pick_rank IS NOT NULL AND id <> ALL($2::uuid[])`,
    [destinationId, ids],
  );
  await tx.query(
    `UPDATE pois p SET pick_rank = v.rank, pick_source = v.source
       FROM unnest($1::uuid[], $2::int[], $3::text[]) AS v(id, rank, source)
      WHERE p.id = v.id
        AND (p.pick_rank IS DISTINCT FROM v.rank OR p.pick_source IS DISTINCT FROM v.source)`,
    [ids, picks.map((pick) => pick.rank), picks.map((pick) => pick.source)],
  );
}
