/**
 * Seeds a trip with a guide and a current plan, and guide actions the autonomy policy already
 * applied (the executor's path, replayed as the migration owner): each moves one new plan item of
 * the given attendees and carries its inverse and undo window.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

export interface GuideTrip {
  readonly tripId: string;
  readonly guideId: string;
}

async function id(pool: pg.Pool, sql: string, values: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, values);
  const row = rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return row.id;
}

export async function seedGuideTrip(
  pool: pg.Pool,
  people: { readonly organiser: string; readonly members: readonly string[] },
): Promise<GuideTrip> {
  const crewId = await id(
    pool,
    "INSERT INTO crews (name, created_by) VALUES ('Bali', $1) RETURNING id",
    [people.organiser],
  );
  const guideId = await id(
    pool,
    "INSERT INTO guides (slug, name, colour) VALUES ($1, 'Tokek', 'green') RETURNING id",
    [`tokek-${randomUUID().slice(0, 8)}`],
  );
  const tripId = await id(
    pool,
    "INSERT INTO trips (crew_id, status, guide_id) VALUES ($1, 'setup', $2) RETURNING id",
    [crewId, guideId],
  );
  const roles: [string, string][] = [
    [people.organiser, 'organiser'],
    ...people.members.map((uid): [string, string] => [uid, 'member']),
  ];
  for (const [uid, role] of roles) {
    await pool.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      uid,
      role,
    ]);
    await pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, role],
    );
  }
  const versionId = await id(
    pool,
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  await pool.query('INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1)', [
    versionId,
    tripId,
  ]);
  await pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [versionId, tripId]);
  return { tripId, guideId };
}

export interface SeededAction {
  readonly actionId: string;
  readonly stableId: string;
  /** The item before the action moved it. */
  readonly original: unknown;
}

export async function seedAppliedAction(
  pool: pg.Pool,
  trip: GuideTrip,
  options: {
    readonly affected: readonly string[];
    readonly undoUntil: Date;
    readonly disruptionId?: string;
  },
): Promise<SeededAction> {
  const stableId = randomUUID();
  const startsAt = new Date(Date.now() + 10 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, category, attendee_ids, notes)
     SELECT t.current_version_id, d.id, t.id, $2, $3, 'transfer', $4, 'Gate B'
       FROM trips t JOIN plan_days d ON d.version_id = t.current_version_id AND d.day_no = 1
      WHERE t.id = $1`,
    [trip.tripId, stableId, startsAt, options.affected],
  );
  const original = await currentItem(pool, trip.tripId, stableId);
  const { rows } = await pool.query<{ starts_at: string }>(
    `SELECT to_jsonb(pi) ->> 'starts_at' AS starts_at FROM plan_items pi JOIN trips t
         ON t.current_version_id = pi.version_id WHERE t.id = $1 AND pi.stable_id = $2`,
    [trip.tripId, stableId],
  );
  const before = { starts_at: rows[0]?.starts_at, notes: 'Gate B' };
  const after = {
    starts_at: new Date(startsAt.getTime() + 40 * 60_000).toISOString(),
    notes: 'Gate B, later',
  };
  const op = { target: stableId, affected_user_ids: options.affected, booking_impact: false };
  const ops = [{ op: 'retime', ...op, before, after, reason: 'flight delayed' }];
  const inverse = {
    type: 'change_set_ops',
    ops: [{ op: 'retime', ...op, before: after, after: before, reason: 'undo: flight delayed' }],
  };
  const changeSetId = await id(
    pool,
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, status, ops)
     SELECT id, current_version_id, 'delay', 'guide', $2, 'draft', $3 FROM trips WHERE id = $1 RETURNING id`,
    [trip.tripId, trip.guideId, JSON.stringify(ops)],
  );
  await pool.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);
  const audit = { affected_user_ids: options.affected, decider: { outcome: 'auto' } };
  const actionId = await id(
    pool,
    `INSERT INTO guide_actions (trip_id, change_set_id, kind, status, reversible, inverse, disruption_id, audit)
     VALUES ($1, $2, 'reschedule_pickup', 'planned', true, $3, $4, $5) RETURNING id`,
    [
      trip.tripId,
      changeSetId,
      JSON.stringify(inverse),
      options.disruptionId ?? null,
      JSON.stringify(audit),
    ],
  );
  await pool.query("UPDATE guide_actions SET status = 'running' WHERE id = $1", [actionId]);
  await pool.query(
    "UPDATE change_sets SET status = 'approved', approved_by_kind = 'policy' WHERE id = $1",
    [changeSetId],
  );
  await pool.query('SELECT app.apply_change_set($1)', [changeSetId]);
  await pool.query("UPDATE guide_actions SET status = 'done', undo_until = $2 WHERE id = $1", [
    actionId,
    options.undoUntil,
  ]);
  return { actionId, stableId, original };
}

/** The item as stored in the trip's current version, without per-version ids and timestamps. */
export async function currentItem(
  pool: pg.Pool,
  tripId: string,
  stableId: string,
): Promise<unknown> {
  const { rows } = await pool.query<{ item: unknown }>(
    `SELECT to_jsonb(pi) - 'id' - 'version_id' - 'day_id' - 'created_at' - 'updated_at' AS item
       FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
      WHERE t.id = $1 AND pi.stable_id = $2`,
    [tripId, stableId],
  );
  return rows[0]?.item;
}
