/**
 * The picks of one destination, in order: the well-known places the model named and we found in
 * our rows first (in the model's order, best known first), then the best open-data rows by
 * quality, shared out across kinds of place so food cannot fill the list. One row per place: two
 * rows are the same place when their names fold to the same words, or when they sit within about
 * 150 m of each other and most of their words overlap; the earlier row (a named one, else the
 * better one) is kept.
 */
import { nameAliases } from '@cp/planner';

import type { PickCandidate } from './match';

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
