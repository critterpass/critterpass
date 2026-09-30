/**
 * A trip with a crew-visible current plan for the plan suites: three dated days in Asia/Tokyo; day 1
 * holds a free walk and a booked dinner, day 2 a museum, day 3 is free.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import type pg from 'pg';

export interface SeededPlan {
  readonly versionId: string;
  readonly walk: string;
  readonly dinner: string;
  readonly museum: string;
  readonly dates: readonly string[];
}

export const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** `YYYY-MM-DD` + local hour in Tokyo, as an ISO instant. */
export const tokyo = (date: string, hour: number): string =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+09:00`).toISOString();

export async function seedCurrentPlan(pool: pg.Pool, tripId: string): Promise<SeededPlan> {
  const dates = [day(40), day(41), day(42)];
  const ids = { walk: randomUUID(), dinner: randomUUID(), museum: randomUUID() };
  const versionId = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
       RETURNING id`,
      [tripId],
    );
    const version = rows[0]?.id as string;
    const dayIds: string[] = [];
    for (const [index, date] of dates.entries()) {
      const { rows: dayRows } = await tx.query<{ id: string }>(
        `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [version, tripId, index + 1, date, `Day ${index + 1}`],
      );
      dayIds.push(dayRows[0]?.id as string);
    }
    const item = (
      stable: string,
      dayIndex: number,
      hour: number,
      extra: string,
      lock: string | null,
    ) =>
      tx.query(
        `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
           category, cost_model, amount_minor, currency, locked_reason)
         VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Tokyo', $7, 'per_person', 2000, 'USD', $8)`,
        [
          version,
          dayIds[dayIndex],
          tripId,
          stable,
          tokyo(dates[dayIndex] as string, hour),
          tokyo(dates[dayIndex] as string, hour + 2),
          extra,
          lock,
        ],
      );
    await item(ids.walk, 0, 9, 'walk', null);
    await item(ids.dinner, 0, 18, 'dinner', 'booking');
    await item(ids.museum, 1, 10, 'museum', null);
    await tx.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, version]);
    return version;
  });
  return { versionId, ...ids, dates };
}
