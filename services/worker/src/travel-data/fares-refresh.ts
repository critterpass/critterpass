/**
 * `fares.refresh` (docs/api-contracts-async.md §2.3, 02:00 SGT nightly): Travelpayouts month
 * calendars for every origin × destination × month the app can show. Origins are the home airports
 * of active members of crews with a live trip, plus the nearest hub of each (the labelled fallback
 * for thin origins); destinations are the live destinations with a fare airport; months are the
 * next 12. Each cell is asked once per night: a cell checked within the recheck window is skipped,
 * so a rerun the same night makes no calls and no writes. An empty answer only records the check;
 * the stored price then ages into "no recent price" instead of being zeroed.
 */
import { withSystem } from '@cp/db';
import {
  FARE_MONTHS_AHEAD,
  FARE_REFRESH_TZ,
  farePriceObservationSchema,
  monthKeyIn,
  nearestFareHub,
  nextMonthKeys,
  toLocalWallTime,
  TRAVEL_DESTINATIONS,
  type FarePriceObservation,
} from '@cp/domain';
import { mapFareMonth, type FareMonthQuery, type FareMonthResult } from '@cp/suppliers';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../boss/define-job';
import { detectFareDrop, emitFareDrop, recordObservation } from './fare-drop';

/** A cell asked this recently is not asked again (one supplier call per cell per night). */
export const FARE_RECHECK_HOURS = 20;
const CONCURRENCY = 4;

export type FetchFareMonth = (
  query: FareMonthQuery,
  signal?: AbortSignal,
) => Promise<FareMonthResult>;

export interface FareTarget {
  readonly origin: string;
  readonly destIata: string;
  readonly destinationId: string;
  /** `YYYY-MM`. */
  readonly month: string;
}

export interface FareRefreshReport {
  readonly targets: number;
  readonly skipped: number;
  readonly priced: number;
  readonly empty: number;
  readonly failed: number;
  readonly drops: number;
}

/** Origins: live crews' active members' home airports, plus each one's nearest hub. */
export async function selectFareOrigins(tx: pg.PoolClient): Promise<string[]> {
  const { rows } = await tx.query<{ origin: string; lat: number | null; lng: number | null }>(
    `SELECT o.origin, c.lat, c.lng
       FROM (
         SELECT DISTINCT upper(u.home_airport) AS origin
           FROM users u
           JOIN crew_members cm ON cm.user_id = u.id AND cm.status = 'active'
          WHERE u.home_airport ~* '^[a-z]{3}$'
            AND EXISTS (
              SELECT 1 FROM trips t
               WHERE t.crew_id = cm.crew_id
                 AND t.status NOT IN ('post_trip', 'archived', 'cancelled'))
       ) o
       LEFT JOIN LATERAL (
         SELECT lat, lng FROM cities WHERE o.origin = ANY (iata_nearby)
          ORDER BY population DESC NULLS LAST LIMIT 1
       ) c ON true`,
  );
  const origins = new Set<string>();
  for (const row of rows) {
    origins.add(row.origin);
    if (row.lat !== null && row.lng !== null) {
      const hub = nearestFareHub(row.lat, row.lng, row.origin);
      if (hub !== undefined) origins.add(hub.iata);
    }
  }
  return [...origins].sort();
}

export async function selectFareTargets(tx: pg.PoolClient, now: Date): Promise<FareTarget[]> {
  const origins = await selectFareOrigins(tx);
  const { rows } = await tx.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM destinations WHERE slug = ANY ($1) ORDER BY slug',
    [Object.keys(TRAVEL_DESTINATIONS)],
  );
  const months = nextMonthKeys(monthKeyIn(now, FARE_REFRESH_TZ), FARE_MONTHS_AHEAD);
  const targets: FareTarget[] = [];
  for (const destination of rows) {
    const destIata = TRAVEL_DESTINATIONS[destination.slug]?.airports[0];
    if (destIata === undefined) continue;
    for (const origin of origins) {
      if (origin === destIata) continue;
      for (const month of months) {
        targets.push({ origin, destIata, destinationId: destination.id, month });
      }
    }
  }
  return targets;
}

interface ExistingCell {
  readonly id: string;
  readonly checked_at: Date;
  readonly price_history: unknown;
}

const historySchema = z.array(farePriceObservationSchema);

/** Upserts one cell from one month's answer; returns whether a drop was announced. */
export async function applyFareMonth(
  tx: pg.PoolClient,
  target: FareTarget,
  result: FareMonthResult,
  now: Date,
): Promise<{ priced: boolean; drops: number }> {
  const summary = mapFareMonth(result.prices, result.currency);
  const monthDate = `${target.month}-01`;
  const existing = (
    await tx.query<ExistingCell>(
      `SELECT id, checked_at, price_history FROM fare_cells
        WHERE origin_iata = $1 AND dest_iata = $2 AND month = $3 FOR UPDATE`,
      [target.origin, target.destIata, monthDate],
    )
  ).rows[0];

  if (summary === null) {
    if (existing === undefined) {
      await tx.query(
        `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, currency, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [target.origin, target.destIata, target.destinationId, monthDate, 'USD', now],
      );
    } else {
      await tx.query('UPDATE fare_cells SET checked_at = $2 WHERE id = $1', [existing.id, now]);
    }
    return { priced: false, drops: 0 };
  }

  const today = toLocalWallTime(now, FARE_REFRESH_TZ).date;
  const history: FarePriceObservation[] =
    existing === undefined ? [] : historySchema.parse(existing.price_history);
  const firstToday = !history.some((entry) => entry.on === today);
  const drop = firstToday ? detectFareDrop(history, summary.priceMinor, today) : null;
  const nextHistory = recordObservation(history, summary.priceMinor, today);

  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, depart_on, return_on,
        price_minor, currency, transfers, duration_min, fastest_duration_min, days, price_history,
        found_at, fetched_at, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
     ON CONFLICT (origin_iata, dest_iata, month) DO UPDATE SET
       destination_id = EXCLUDED.destination_id, depart_on = EXCLUDED.depart_on,
       return_on = EXCLUDED.return_on, price_minor = EXCLUDED.price_minor,
       currency = EXCLUDED.currency, transfers = EXCLUDED.transfers,
       duration_min = EXCLUDED.duration_min, fastest_duration_min = EXCLUDED.fastest_duration_min,
       days = EXCLUDED.days, price_history = EXCLUDED.price_history,
       found_at = EXCLUDED.found_at, fetched_at = EXCLUDED.fetched_at,
       checked_at = EXCLUDED.checked_at
     RETURNING id`,
    [
      target.origin,
      target.destIata,
      target.destinationId,
      monthDate,
      summary.departOn,
      summary.returnOn,
      summary.priceMinor,
      summary.currency,
      summary.transfers,
      summary.durationMin,
      summary.fastestDurationMin,
      JSON.stringify(summary.days),
      JSON.stringify(nextHistory),
      summary.foundAt,
      now,
    ],
  );
  const cellId = rows[0]?.id;
  if (cellId === undefined) throw new Error('fare cell upsert returned no id');
  const drops =
    drop === null
      ? 0
      : await emitFareDrop(
          tx,
          {
            cellId,
            origin: target.origin,
            destinationId: target.destinationId,
            month: target.month,
            currency: summary.currency,
          },
          drop,
        );
  return { priced: true, drops };
}

async function isRecentlyChecked(pool: pg.Pool, target: FareTarget, now: Date): Promise<boolean> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query(
      `SELECT 1 FROM fare_cells
        WHERE origin_iata = $1 AND dest_iata = $2 AND month = $3
          AND checked_at > $4::timestamptz - make_interval(hours => $5)`,
      [target.origin, target.destIata, `${target.month}-01`, now, FARE_RECHECK_HOURS],
    ),
  );
  return rows.length > 0;
}

export interface RefreshFaresOptions {
  readonly pool: pg.Pool;
  readonly fetchMonth: FetchFareMonth;
  readonly logger: JobLogger;
  readonly now?: Date;
  readonly signal?: AbortSignal;
  /** Narrows the night's targets (a manual rerun of one route). */
  readonly only?: (target: FareTarget) => boolean;
}

export async function refreshFares(options: RefreshFaresOptions): Promise<FareRefreshReport> {
  const now = options.now ?? new Date();
  const selected = await withSystem(options.pool, (tx) => selectFareTargets(tx, now));
  const targets = options.only === undefined ? selected : selected.filter(options.only);
  let skipped = 0;
  let priced = 0;
  let empty = 0;
  let failed = 0;
  let drops = 0;

  const queue = [...targets];
  async function worker(): Promise<void> {
    for (let target = queue.shift(); target !== undefined; target = queue.shift()) {
      if (options.signal?.aborted === true) return;
      if (await isRecentlyChecked(options.pool, target, now)) {
        skipped += 1;
        continue;
      }
      try {
        const result = await options.fetchMonth(
          { origin: target.origin, destination: target.destIata, month: target.month },
          options.signal,
        );
        const current = target;
        const outcome = await withSystem(options.pool, (tx) =>
          applyFareMonth(tx, current, result, now),
        );
        if (outcome.priced) priced += 1;
        else empty += 1;
        drops += outcome.drops;
      } catch (error) {
        failed += 1;
        options.logger.warn({ err: error, ...target }, 'fare month refresh failed');
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return { targets: targets.length, skipped, priced, empty, failed, drops };
}

export function faresRefreshJob(fetchMonth: FetchFareMonth): AnyJobDefinition {
  return defineJob({
    queue: 'fares.refresh',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger, job }) {
      const report = await refreshFares({ pool, fetchMonth, logger, signal: job.signal });
      logger.info({ ...report }, 'fares refreshed');
      return { ...report };
    },
  });
}
