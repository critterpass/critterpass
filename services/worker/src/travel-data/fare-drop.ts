/**
 * Fare drop detection and `fare.dropped` fan-out: a night's price at least 10 % under the previous
 * 7-day minimum is a drop, told to every live crew with an active member flying from that origin.
 * The check reads only the stored nightly observations, so rerunning a night finds the same drop
 * only if the precompute wrote a new observation, which it does once per cell per night.
 */
import { appendDomainEvent } from '@cp/db';
import {
  FARE_DROP_THRESHOLD_PCT,
  FARE_DROP_WINDOW_DAYS,
  type FarePriceObservation,
} from '@cp/domain';
import type pg from 'pg';

export interface FareDrop {
  readonly priceMinor: number;
  readonly previousMinMinor: number;
  readonly deltaPct: number;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Pure: compares `priceMinor` observed on `today` with the minimum of the 7 days before it. */
export function detectFareDrop(
  history: readonly FarePriceObservation[],
  priceMinor: number,
  today: string,
): FareDrop | null {
  const window = history.filter((entry) => {
    const age = daysBetween(entry.on, today);
    return age >= 1 && age <= FARE_DROP_WINDOW_DAYS;
  });
  if (window.length === 0) return null;
  const previousMinMinor = Math.min(...window.map((entry) => entry.price_minor));
  if (previousMinMinor <= 0) return null;
  const deltaPct = Math.floor(((previousMinMinor - priceMinor) / previousMinMinor) * 100);
  if (deltaPct < FARE_DROP_THRESHOLD_PCT) return null;
  return { priceMinor, previousMinMinor, deltaPct };
}

/** Keeps one observation per day (today's replaces an earlier one) and the last 8 days. */
export function recordObservation(
  history: readonly FarePriceObservation[],
  priceMinor: number,
  today: string,
): FarePriceObservation[] {
  return [...history.filter((entry) => entry.on !== today), { on: today, price_minor: priceMinor }]
    .filter((entry) => daysBetween(entry.on, today) <= FARE_DROP_WINDOW_DAYS)
    .sort((a, b) => a.on.localeCompare(b.on));
}

export interface FareDropTarget {
  readonly cellId: string;
  readonly origin: string;
  readonly destinationId: string;
  readonly month: string;
  readonly currency: string;
}

/** Appends one `fare.dropped` per live crew with an active member whose home airport is `origin`. */
export async function emitFareDrop(
  tx: pg.PoolClient,
  target: FareDropTarget,
  drop: FareDrop,
): Promise<number> {
  const { rows } = await tx.query<{ crew_id: string }>(
    `SELECT DISTINCT cm.crew_id
       FROM crew_members cm
       JOIN users u ON u.id = cm.user_id
      WHERE cm.status = 'active'
        AND upper(u.home_airport) = $1
        AND EXISTS (
          SELECT 1 FROM trips t
           WHERE t.crew_id = cm.crew_id
             AND t.status NOT IN ('post_trip', 'archived', 'cancelled'))
      ORDER BY cm.crew_id`,
    [target.origin],
  );
  for (const row of rows) {
    await appendDomainEvent(tx, {
      type: 'fare.dropped',
      aggregateKind: 'fare_cell',
      aggregateId: target.cellId,
      actorKind: 'system',
      actorId: null,
      crewId: row.crew_id,
      tripId: null,
      payload: {
        crew_id: row.crew_id,
        destination_id: target.destinationId,
        month: target.month,
        origin: target.origin,
        price_minor: drop.priceMinor,
        previous_min_minor: drop.previousMinMinor,
        currency: target.currency,
        delta_pct: drop.deltaPct,
      },
    });
  }
  return rows.length;
}
