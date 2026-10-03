/**
 * Arms the year-later memory for every traveller of a recap: `fire_on` is the trip's best
 * day a year on (its first day when no day stood out), `fire_at` 10:00 that day in the traveller's
 * own zone (their newest phone's, else the trip's). A re-run that moves the best day moves the
 * timers that have not fired; a fired one stays fired.
 */
import type pg from 'pg';

/** Local hour the memory arrives: a quiet morning, never at midnight. */
export const ANNIVERSARY_LOCAL_TIME = '10:00';

export async function scheduleAnniversaries(tx: pg.PoolClient, recapId: string): Promise<number> {
  const { rowCount } = await tx.query(
    `INSERT INTO anniversaries (trip_id, recap_id, user_id, fire_on, tz, fire_at)
     SELECT r.trip_id, r.id, v.user_id, day.fire_on, zone.tz,
            (day.fire_on + $2::time) AT TIME ZONE zone.tz
       FROM recaps r
       JOIN trips t ON t.id = r.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       JOIN recap_views v ON v.recap_id = r.id
       CROSS JOIN LATERAL (
         SELECT (coalesce((r.stats #>> '{best_day,local_date}')::date,
                          (r.stats ->> 'start_date')::date, t.start_date)
                 + interval '1 year')::date AS fire_on
       ) day
       CROSS JOIN LATERAL (
         SELECT coalesce(
           (SELECT app.canonical_tz(dv.tz) FROM devices dv
             WHERE dv.user_id = v.user_id ORDER BY dv.last_seen_at DESC NULLS LAST, dv.id LIMIT 1),
           coalesce(t.tz, d.tz, 'UTC')
         ) AS tz
       ) zone
      WHERE r.id = $1 AND day.fire_on IS NOT NULL
     ON CONFLICT (trip_id, user_id) DO UPDATE
        SET fire_on = EXCLUDED.fire_on, tz = EXCLUDED.tz, fire_at = EXCLUDED.fire_at,
            recap_id = EXCLUDED.recap_id
      WHERE anniversaries.status = 'scheduled'`,
    [recapId, ANNIVERSARY_LOCAL_TIME],
  );
  return rowCount ?? 0;
}
