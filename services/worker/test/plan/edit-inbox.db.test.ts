/**
 * An organiser's own edit to a locked plan reaches everyone else going: one inbox entry naming the
 * change and one line in crew chat, once. Edits before the lock stay quiet. Real database, the real
 * fan-out.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fanOutEvent } from '../../src/jobs/inbox/fanout';
import { registerPlanInboxFanouts } from '../../src/jobs/plan/inbox';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { insertEvent } from '../notify-fixtures';

const TZ = 'Asia/Ho_Chi_Minh';

let harness: JobsHarness;
let linh: string;
let minh: string;
let an: string;
let crewId: string;
let tripId: string;
let baNa: string;
let sonTra: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await harness.pool.query(sql, params);
  if (rows[0] === undefined) throw new Error(`no row: ${sql}`);
  return rows[0] as T;
}
const all = async <T>(sql: string, params: unknown[] = []) =>
  (await harness.pool.query(sql, params)).rows as T[];

/** A version of day 3 (Wed 21 Oct) holding the given stops: `[stable id, place, start]`. */
async function version(stops: readonly (readonly [string, string, string])[]): Promise<string> {
  const { id } = await one<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status)
     VALUES ($1, 'crew', 'superseded') RETURNING id`,
    [tripId],
  );
  const day = await one<{ id: string }>(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 3, '2026-10-21')
     RETURNING id`,
    [id, tripId],
  );
  for (const [stableId, poiId, startsAt] of stops) {
    await harness.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, tz, poi_id, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'sight', 'confirmed')`,
      [id, day.id, tripId, stableId, startsAt, TZ, poiId],
    );
  }
  return id;
}

const edit = (versionId: string, baseVersionId: string) =>
  insertEvent(
    harness.pool,
    'plan.ops_applied',
    {
      trip_id: tripId,
      version_id: versionId,
      base_version_id: baseVersionId,
      op_count: 1,
      source: 'ops',
    },
    { crewId, tripId, actorId: linh },
  );

const itemsOf = (versionId: string) =>
  all<{ user_id: string; kind: string; needs_you: boolean; data: Record<string, unknown> }>(
    "SELECT user_id, kind, needs_you, data FROM inbox_items WHERE data->>'version_id' = $1",
    [versionId],
  );
const lines = () =>
  all<{ ref_kind: string; ref_id: string; body: string }>(
    `SELECT ref_kind, ref_id, body FROM messages
      WHERE crew_id = $1 AND type = 'system' AND ref_kind LIKE 'plan_edit%' ORDER BY seq`,
    [crewId],
  );

beforeAll(async () => {
  harness = await startJobsHarness();
  registerPlanInboxFanouts();
  [linh, minh, an] = [randomUUID(), randomUUID(), randomUUID()];
  for (const [id, name] of [
    [linh, 'Linh Tran'],
    [minh, 'Minh Le'],
    [an, 'An Pham'],
  ] as const) {
    await harness.pool.query(
      "INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)",
      [id, name],
    );
  }
  ({ id: crewId } = await one<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Da Nang gang', $1) RETURNING id",
    [linh],
  ));
  for (const uid of [linh, minh, an]) {
    await harness.pool.query('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [
      crewId,
      uid,
    ]);
  }
  const destination = await one<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('da-nang-plan-edit', 'Đà Nẵng', 'live', $1) RETURNING id`,
    [TZ],
  );
  ({ id: baNa } = await one<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Bà Nà Hills', 'other', 15.99, 107.99) RETURNING id`,
    [destination.id],
  ));
  ({ id: sonTra } = await one<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Sơn Trà', 'other', 16.1, 108.27) RETURNING id`,
    [destination.id],
  ));
  ({ id: tripId } = await one<{ id: string }>(
    "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'confirmed', $2) RETURNING id",
    [crewId, destination.id],
  ));
  for (const [uid, role, rsvp] of [
    [linh, 'organiser', 'in'],
    [minh, 'member', 'maybe'],
    [an, 'member', 'out'],
  ] as const) {
    await harness.pool.query(
      'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
      [tripId, uid, role, rsvp],
    );
  }
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe("an organiser's edit to the locked plan", () => {
  it('tells everyone else going what changed, with one chat line', async () => {
    const baNaStop = randomUUID();
    const base = await version([[baNaStop, baNa, '2026-10-21T00:00:00Z']]);
    const next = await version([
      [baNaStop, baNa, '2026-10-21T00:00:00Z'],
      [randomUUID(), sonTra, '2026-10-21T05:45:00Z'],
    ]);
    const eventId = await edit(next, base);
    expect(await fanOutEvent(harness.pool, eventId)).toMatchObject({ filed: 1 });
    expect(await fanOutEvent(harness.pool, eventId)).toMatchObject({ filed: 0 });

    // Minh is a maybe and still going; An can't make it; Linh made the change.
    const filed = await itemsOf(next);
    expect(filed).toHaveLength(1);
    expect(filed).toMatchObject([
      {
        user_id: minh,
        kind: 'plan_change.edited',
        needs_you: false,
        data: {
          op: 'add',
          title: 'Sơn Trà',
          date: '2026-10-21',
          time: '12:45',
          count: 1,
        },
      },
    ]);
    expect(await lines()).toEqual([
      { ref_kind: 'plan_edit_added', ref_id: linh, body: 'Sơn Trà · 2026-10-21 12:45' },
    ]);
  });

  it('names a moved stop, and counts several changes', async () => {
    const stop = randomUUID();
    const base = await version([[stop, baNa, '2026-10-21T00:00:00Z']]);
    const moved = await version([[stop, baNa, '2026-10-21T02:00:00Z']]);
    await fanOutEvent(harness.pool, await edit(moved, base));
    expect((await itemsOf(moved))[0]?.data).toMatchObject({ op: 'move', time: '09:00', count: 1 });

    const both = await version([[randomUUID(), sonTra, '2026-10-21T05:45:00Z']]);
    await fanOutEvent(harness.pool, await edit(both, moved));
    expect((await itemsOf(both))[0]?.data).toMatchObject({ op: 'add', count: 2 });
    expect((await lines()).map((line) => line.ref_kind).slice(-2)).toEqual([
      'plan_edit_moved',
      'plan_edited',
    ]);
  });

  it('stays quiet while the plan is still being agreed', async () => {
    await harness.pool.query("UPDATE trips SET status = 'voting' WHERE id = $1", [tripId]);
    const base = await version([]);
    const next = await version([[randomUUID(), sonTra, '2026-10-21T05:45:00Z']]);
    expect(await fanOutEvent(harness.pool, await edit(next, base))).toMatchObject({ filed: 0 });
    await harness.pool.query("UPDATE trips SET status = 'confirmed' WHERE id = $1", [tripId]);
  });
});
