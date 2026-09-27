/**
 * A crew on a trip with a guide and a current plan: Rin's airport pickup on day 1 (Rin only) and
 * the crew dinner on day 1 (everyone). Seeded as the migration owner, like the other worker suites.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

export interface PlanItemRef {
  readonly stableId: string;
  readonly startsAt: Date;
}

export interface GuidePlanFixture {
  readonly tripId: string;
  readonly crewId: string;
  readonly guideId: string;
  readonly organiserId: string;
  readonly rinId: string;
  readonly mayaId: string;
  readonly outsiderId: string;
  readonly versionId: string;
  readonly pickup: PlanItemRef;
  readonly dinner: PlanItemRef;
}

const HOUR = 60 * 60 * 1000;
const TO_IN_TRIP = ['drafting', 'draft_review', 'proposed', 'confirmed', 'pre_trip', 'in_trip'];

async function one<T>(pool: pg.Pool, sql: string, values: unknown[]): Promise<T> {
  const { rows } = await pool.query<{ id: T }>(sql, values);
  const row = rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return row.id;
}

export async function buildGuidePlan(
  pool: pg.Pool,
  options: { readonly inTrip?: boolean; readonly now?: Date } = {},
): Promise<GuidePlanFixture> {
  const now = options.now ?? new Date();
  const [organiserId, rinId, mayaId, outsiderId] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  for (const id of [organiserId, rinId, mayaId, outsiderId]) {
    await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
  }
  const crewId = await one<string>(
    pool,
    "INSERT INTO crews (name, created_by) VALUES ('Bali crew', $1) RETURNING id",
    [organiserId],
  );
  for (const [userId, role] of [
    [organiserId, 'organiser'],
    [rinId, 'member'],
    [mayaId, 'member'],
  ]) {
    await pool.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      userId,
      role,
    ]);
  }
  const guideId = await one<string>(
    pool,
    "INSERT INTO guides (slug, name, colour) VALUES ($1, 'Tokek', 'green') RETURNING id",
    [`tokek-${randomUUID().slice(0, 8)}`],
  );
  const tripId = await one<string>(
    pool,
    "INSERT INTO trips (crew_id, status, guide_id) VALUES ($1, 'setup', $2) RETURNING id",
    [crewId, guideId],
  );
  if (options.inTrip === true) {
    for (const status of TO_IN_TRIP) {
      await pool.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
    }
  }
  for (const [userId, role] of [
    [organiserId, 'organiser'],
    [rinId, 'member'],
    [mayaId, 'member'],
  ]) {
    await pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, userId, role],
    );
  }
  const versionId = await one<string>(
    pool,
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  const dayId = await one<string>(
    pool,
    'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
    [versionId, tripId],
  );
  await pool.query('INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 2)', [
    versionId,
    tripId,
  ]);
  const item = async (
    category: string,
    startsAt: Date,
    attendees: string[],
    notes: string | null,
  ) => {
    const stableId = randomUUID();
    await pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category,
         attendee_ids, amount_minor, currency, notes, created_by_kind)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Makassar', $7, $8, 45000, 'IDR', $9, 'guide')`,
      [
        versionId,
        dayId,
        tripId,
        stableId,
        startsAt,
        new Date(startsAt.getTime() + HOUR),
        category,
        attendees,
        notes,
      ],
    );
    return { stableId, startsAt };
  };
  const pickup = await item('transfer', new Date(now.getTime() + 10 * HOUR), [rinId], 'Gate B');
  const dinner = await item(
    'dinner',
    new Date(now.getTime() + 12 * HOUR),
    [organiserId, rinId, mayaId],
    null,
  );
  await pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [versionId, tripId]);
  return {
    tripId,
    crewId,
    guideId,
    organiserId,
    rinId,
    mayaId,
    outsiderId,
    versionId,
    pickup,
    dinner,
  };
}

/** The item's columns that a plan change may alter, as stored (ids and timestamps excluded). */
export async function itemBytes(pool: pg.Pool, tripId: string, stableId: string): Promise<unknown> {
  const { rows } = await pool.query<{ item: unknown }>(
    `SELECT to_jsonb(pi) - 'id' - 'version_id' - 'day_id' - 'created_at' - 'updated_at' AS item
       FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
      WHERE t.id = $1 AND pi.stable_id = $2`,
    [tripId, stableId],
  );
  return rows[0]?.item;
}
