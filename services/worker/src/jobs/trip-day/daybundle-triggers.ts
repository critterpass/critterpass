/**
 * When day bundles are written: at 20:00 the night before each trip day (a `scheduled_events` timer
 * per day, on the trip's clock), right away for a day whose evening has already passed (a plan
 * change on the day), and when a leave-by window opens (the leave-by timer queues it). The phone's
 * own triggers (leaving the stay, "Save today offline") download whatever is current.
 */
import { scheduleEvent, sendInTx } from '@cp/db';
import { localSchedule, toLocalWallTime, TRIP_DAY_QUEUES } from '@cp/domain';
import type pg from 'pg';

export const NIGHT_BEFORE = '20:00';

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Arms (or queues) every remaining day's bundle; resolves to how many days were covered. */
export async function armDayBundles(tx: pg.PoolClient, tripId: string, now: Date): Promise<number> {
  const { rows } = await tx.query<{
    tz: string | null;
    start_date: string | null;
    end_date: string | null;
  }>(
    `SELECT coalesce(t.tz, d.tz) AS tz, t.start_date::text AS start_date, t.end_date::text AS end_date
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 AND t.status NOT IN ('cancelled', 'archived', 'post_trip')`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined || trip.tz === null || trip.start_date === null) return 0;
  const tz = trip.tz;
  const last = trip.end_date ?? trip.start_date;
  const today = toLocalWallTime(now, tz).date;
  let covered = 0;
  for (
    let date = today > trip.start_date ? today : trip.start_date;
    date <= last;
    date = addDays(date, 1)
  ) {
    const eve = { date: addDays(date, -1), time: NIGHT_BEFORE };
    if (localSchedule({ ...eve, tz }).getTime() > now.getTime()) {
      await scheduleEvent(tx, {
        kind: TRIP_DAY_QUEUES.dayBundle,
        refId: tripId,
        slot: date,
        tz,
        local: eve,
      });
    } else {
      await sendInTx(
        tx,
        TRIP_DAY_QUEUES.dayBundle,
        { trip_id: tripId, local_date: date },
        { singletonKey: `${tripId}:${date}` },
      );
    }
    covered += 1;
  }
  return covered;
}
