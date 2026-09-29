/**
 * The draft's prefetch, all code and all bounded: the season signal for the trip's dates (a
 * reviewed event overlapping them, else the month's reviewed highlight), and the closures the
 * pre-draft web check cites for those dates. Each lookup has its own time limit; one that runs out
 * leaves its part empty rather than holding up the draft.
 */
import { withSystem } from '@cp/db';
import type { UsageContext } from '@cp/ai';
import type { ClosureRecord } from '@cp/domain';
import type pg from 'pg';

import type { DraftTripData } from './load';

/** Longest any one prefetch lookup may take. */
export const PREFETCH_TIMEOUT_MS = 8_000;

export async function withTimeout<T>(
  work: Promise<T>,
  fallback: T,
  ms = PREFETCH_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work.catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

export async function seasonSignal(pool: pg.Pool, trip: DraftTripData): Promise<string | null> {
  return withSystem(pool, async (tx) => {
    const events = await tx.query<{ name: string }>(
      `SELECT name FROM season_events
        WHERE destination_id = $1 AND reviewed_at IS NOT NULL
          AND starts_on <= $3::date AND ends_on >= $2::date
        ORDER BY starts_on, name LIMIT 1`,
      [trip.destinationId, trip.startDate, trip.endDate],
    );
    if (events.rows[0] !== undefined) return events.rows[0].name;
    const month = await tx.query<{ highlight_tag: string | null }>(
      `SELECT highlight_tag FROM season_months
        WHERE destination_id = $1 AND month = extract(month FROM $2::date)::int AND reviewed_at IS NOT NULL`,
      [trip.destinationId, trip.startDate],
    );
    const tag = month.rows[0]?.highlight_tag ?? null;
    return tag === null ? null : tag.replaceAll('_', ' ');
  });
}

/** Closures on the trip dates, from the pre-draft web check (cite-only; places by our id). */
export type ClosureCheck = (
  trip: DraftTripData,
  places: readonly { id: string; name: string }[],
  usage?: UsageContext,
) => Promise<ClosureRecord[]>;

export const noClosureCheck: ClosureCheck = () => Promise.resolve([]);

export interface PrefetchResult {
  readonly signal: string | null;
  readonly closures: readonly ClosureRecord[];
}

export async function prefetch(
  pool: pg.Pool,
  trip: DraftTripData,
  places: readonly { id: string; name: string }[],
  closures: ClosureCheck,
  usage?: UsageContext,
): Promise<PrefetchResult> {
  const [signal, found] = await Promise.all([
    withTimeout(seasonSignal(pool, trip), null),
    withTimeout(closures(trip, places, usage), [], 20_000),
  ]);
  return { signal, closures: found };
}
