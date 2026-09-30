/**
 * When each member's morning briefing runs: one `briefing.build` timer per trip participant,
 * re-armed after every run for their next morning. Mornings run daily from 30 days before the trip
 * to its last day, at 07:00 or an hour before that day's first item (never before 05:00), on the
 * trip's clock during the trip and the member's own clock before it.
 */
import { scheduleEvent } from '@cp/db';
import { briefingLocalTime, localSchedule, toLocalWallTime, TRIP_DAY_QUEUES } from '@cp/domain';
import type pg from 'pg';

/** How many days before the trip starts the daily briefing begins. */
export const PRE_TRIP_DAYS = 30;

export interface BriefingParticipant {
  readonly id: string;
  readonly trip_id: string;
  readonly user_id: string;
  readonly user_tz: string | null;
  readonly trip_tz: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
}

/** A going participant of a trip that is not over; `undefined` otherwise. */
export async function briefingParticipant(
  tx: pg.PoolClient,
  participantId: string,
): Promise<BriefingParticipant | undefined> {
  const { rows } = await tx.query<BriefingParticipant>(
    `SELECT p.id, p.trip_id, p.user_id, u.tz AS user_tz, coalesce(t.tz, d.tz) AS trip_tz,
            t.start_date::text AS start_date, t.end_date::text AS end_date
       FROM trip_participants p JOIN users u ON u.id = p.user_id JOIN trips t ON t.id = p.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE p.id = $1 AND p.rsvp NOT IN ('out', 'waitlisted')
        AND t.status NOT IN ('cancelled', 'archived', 'post_trip')`,
    [participantId],
  );
  return rows[0];
}

/** The member's clock for a date: the trip's zone on trip days, their own before the trip. */
export function briefingZone(row: BriefingParticipant, localDate: string): string {
  const onTrip = row.start_date !== null && localDate >= row.start_date;
  return (onTrip ? row.trip_tz : row.user_tz) ?? row.trip_tz ?? 'UTC';
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function firstItemLocal(
  tx: pg.PoolClient,
  tripId: string,
  date: string,
  tz: string,
): Promise<string | null> {
  const from = localSchedule({ date, time: '00:00', tz });
  const { rows } = await tx.query<{ at: Date | null }>(
    `SELECT min(i.starts_at) AS at FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
      WHERE t.id = $1 AND i.starts_at >= $2 AND i.starts_at < $3`,
    [tripId, from, new Date(from.getTime() + 86_400_000)],
  );
  const at = rows[0]?.at ?? null;
  return at === null ? null : toLocalWallTime(at, tz).time.slice(0, 5);
}

/** Arms the member's next morning after `now`; resolves to its local date, or null when none. */
export async function armNextBriefing(
  tx: pg.PoolClient,
  participantId: string,
  now: Date,
): Promise<string | null> {
  const row = await briefingParticipant(tx, participantId);
  if (row === undefined || row.start_date === null) return null;
  const last = row.end_date ?? row.start_date;
  const opens = addDays(row.start_date, -PRE_TRIP_DAYS);
  const today = toLocalWallTime(now, row.user_tz ?? row.trip_tz ?? 'UTC').date;
  let date = today < opens ? opens : addDays(today, -1);
  for (let tries = 0; tries < 4 && date <= last; tries += 1, date = addDays(date, 1)) {
    const tz = briefingZone(row, date);
    const time = briefingLocalTime(await firstItemLocal(tx, row.trip_id, date, tz));
    if (localSchedule({ date, time, tz }).getTime() <= now.getTime()) continue;
    await scheduleEvent(tx, {
      kind: TRIP_DAY_QUEUES.briefing,
      refId: row.id,
      tz,
      local: { date, time },
      data: { local_date: date },
    });
    return date;
  }
  return null;
}

/** Arms the next morning of every going participant of a trip (after plan or trip changes). */
export async function armTripBriefings(
  tx: pg.PoolClient,
  tripId: string,
  now: Date,
): Promise<number> {
  const { rows } = await tx.query<{ id: string }>(
    "SELECT id FROM trip_participants WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted')",
    [tripId],
  );
  let armed = 0;
  for (const participant of rows) {
    if ((await armNextBriefing(tx, participant.id, now)) !== null) armed += 1;
  }
  return armed;
}
