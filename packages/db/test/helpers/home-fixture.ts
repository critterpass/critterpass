/**
 * Home rows for the shared permission fixture: the organiser's saved place, reminder and app-open
 * count, a tip on the fixture crew, and a nudge from the organiser to the member.
 */
import type pg from 'pg';

export interface HomeFixtureInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly destinationId: string;
  readonly organiser: string;
  readonly member: string;
}

export async function seedHomeRows(tx: pg.PoolClient, input: HomeFixtureInput): Promise<void> {
  await tx.query(`INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'place', $2)`, [
    input.organiser,
    input.destinationId,
  ]);
  await tx.query(
    `INSERT INTO reminders (user_id, target_kind, target_id, fire_at)
     VALUES ($1, 'quiet_window', $2, now() + interval '1 day')`,
    [input.organiser, input.destinationId],
  );
  await tx.query(`INSERT INTO app_open_hours (user_id, hour_local, opens) VALUES ($1, 21, 3)`, [
    input.organiser,
  ]);
  await tx.query(
    `INSERT INTO home_tips (crew_id, kind, text, facts, place_id, dedupe_key, valid_until)
     VALUES ($1, 'season_peak', 'Probe tip', '{"kind":"season_peak"}', $2, 'matrix-probe',
       now() + interval '7 days')`,
    [input.crewId, input.destinationId],
  );
  await tx.query(
    `INSERT INTO nudges (sender_id, target_id, crew_id, trip_id, reason, channel)
     VALUES ($1, $2, $3, $4, 'rsvp', 'push')`,
    [input.organiser, input.member, input.crewId, input.tripId],
  );
}
