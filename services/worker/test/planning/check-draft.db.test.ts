/**
 * The plan check on an organiser's private draft, on a real database: before the crew has a plan
 * the run reads the draft, writes what it finds against the draft and stamps the draft; the
 * trip-wide row the crew reads says nothing about it, and no idea (ideas sync to every member)
 * gets a fit worked out on the draft. Her edits and the guide's deliveries queue
 * the run. Once the crew has a plan, the run reads that one again.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planCheckEventHook, planCheckJob, runPlanCheck } from '../../src/jobs/planning/check';
import { insertCrew, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let tripId: string;
let draftId: string;
const NOW = new Date('2026-10-04T02:00:00Z');
const at = (time: string) => new Date(`2026-10-13T${time}:00+08:00`);

async function addVersion(visibility: 'organiser' | 'crew', status: string, clash: boolean) {
  const version = await db.pool.query<{ id: string }>(
    'INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, $2, $3) RETURNING id',
    [tripId, visibility, status],
  );
  const id = version.rows[0]!.id;
  const day = await db.pool.query<{ id: string }>(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-10-13') RETURNING id",
    [id, tripId],
  );
  for (const [from, to] of [
    ['10:00', '13:00'],
    clash ? ['12:00', '13:00'] : ['13:15', '14:15'],
  ] as const) {
    await db.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Makassar', 'other')`,
      [id, day.rows[0]!.id, tripId, randomUUID(), at(from), at(to)],
    );
  }
  return id;
}

const found = async () =>
  (
    await db.pool.query<{ kind: string; version_id: string }>(
      'SELECT kind, version_id FROM plan_check_issues WHERE trip_id = $1 ORDER BY rank',
      [tripId],
    )
  ).rows;

const ideaFits = async () =>
  (
    await db.pool.query<{ fit: unknown; fit_version_id: string | null }>(
      'SELECT fit, fit_version_id FROM trip_ideas WHERE trip_id = $1',
      [tripId],
    )
  ).rows;

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss([planCheckJob()]);
  const people = [await insertUser(db.pool), await insertUser(db.pool)];
  const crewId = await insertCrew(db.pool, people);
  const destination = await db.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, tz) VALUES ('bali', 'Bali', 'Asia/Makassar') RETURNING id",
  );
  const trip = await db.pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, tz) VALUES ($1, 'setup', $2, 'Asia/Makassar')
     RETURNING id`,
    [crewId, destination.rows[0]!.id],
  );
  tripId = trip.rows[0]!.id;
  const poi = await db.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
     VALUES ($1, 'Tirta Empul', 'temple_shrine', -8.4153, 115.3153, 'editorial') RETURNING id`,
    [destination.rows[0]!.id],
  );
  await db.pool.query(
    `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
     VALUES ($1, $2, 'Tirta Empul', 'temple_shrine', -8.4153, 115.3153, $3, '{save}')`,
    [tripId, poi.rows[0]!.id, [people[1]]],
  );
  draftId = await addVersion('organiser', 'draft', true);
  await db.pool.query('UPDATE trips SET draft_version_id = $1 WHERE id = $2', [draftId, tripId]);
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('plan check on a private draft', () => {
  it("writes the draft's issues and stamps the draft, and tells the crew's row nothing", async () => {
    const outcome = await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, NOW);
    expect(outcome).toMatchObject({ outcome: 'checked', fix: 1 });
    expect(await found()).toEqual([{ kind: 'clash', version_id: draftId }]);
    const { rows } = await db.pool.query(
      `SELECT c.version_id, c.status, c.fix_count, c.know_count, c.runs_today,
              (SELECT checked_at FROM itinerary_versions WHERE id = $2) AS stamped
         FROM plan_checks c WHERE c.trip_id = $1`,
      [tripId, draftId],
    );
    expect(rows[0]).toEqual({
      version_id: null,
      status: 'done',
      fix_count: 0,
      know_count: 0,
      runs_today: 1,
      stamped: NOW,
    });
    // Ideas sync to every member: none carries a fit worked out on the private draft.
    expect(await ideaFits()).toEqual([{ fit: null, fit_version_id: null }]);
    const hints = await db.pool.query(
      "SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload::text LIKE '%' || $2 || '%'",
      [`trip_plan:${tripId}`, draftId],
    );
    expect(hints.rowCount).toBe(0);
  });

  it("queues one run after the organiser's edit and the guide's deliveries", async () => {
    await db.pool.query("DELETE FROM pgboss.job WHERE name = 'plan.check'");
    await withSystem(db.pool, async (tx) => {
      for (const type of [
        'draft.ops_applied',
        'draft.ready',
        'redraft.kept',
        'draft.version_restored',
      ]) {
        await planCheckEventHook(tx, { id: randomUUID(), type, tripId });
      }
      await planCheckEventHook(tx, { id: randomUUID(), type: 'redraft.reverted', tripId });
    });
    const { rows } = await db.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'plan.check' AND data->>'trip_id' = $1",
      [tripId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("reads the crew's plan once there is one", async () => {
    const crewVersion = await addVersion('crew', 'current', false);
    await db.pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
      crewVersion,
      tripId,
    ]);
    const outcome = await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, NOW);
    expect(outcome).toMatchObject({ outcome: 'checked', fix: 0 });
    expect(await found()).toEqual([]);
    const { rows } = await db.pool.query('SELECT version_id FROM plan_checks WHERE trip_id = $1', [
      tripId,
    ]);
    expect(rows[0]).toEqual({ version_id: crewVersion });
    expect(await ideaFits()).toMatchObject([{ fit_version_id: crewVersion }]);
  });
});
