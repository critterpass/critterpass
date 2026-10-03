/**
 * The plan check job on a real database: an edit that makes a clash becomes a fix issue with a
 * one-tap retime, an unchanged issue keeps its id, reverting the edit clears it, ideas get their
 * fit, the daily cap holds back all but the daily run, plan changes queue one debounced run, and
 * nothing in the job's module graph reaches the AI gateway.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { withSystem } from '@cp/db';
import { storedFitSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planCheckEventHook, planCheckJob, runPlanCheck } from '../../src/jobs/planning/check';
import { insertCrew, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let tripId: string;
let versionId: string;
let cooking: string;
let forest: string;
let poiId: string;
const NOW = new Date('2026-10-04T02:00:00Z');
const at = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);

async function issues() {
  const { rows } = await db.pool.query<{ id: string; kind: string; fix: { kind: string } | null }>(
    'SELECT id, kind, fix FROM plan_check_issues WHERE trip_id = $1 ORDER BY rank',
    [tripId],
  );
  return rows;
}

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss([planCheckJob()]);
  const people = [await insertUser(db.pool), await insertUser(db.pool), await insertUser(db.pool)];
  const crewId = await insertCrew(db.pool, people);
  const destination = await db.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, tz) VALUES ('bali', 'Bali', 'Asia/Makassar') RETURNING id",
  );
  const destinationId = destination.rows[0]!.id;
  const poi = await db.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, editorial)
     VALUES ($1, 'Tirta Empul', 'temple_shrine', -8.4153, 115.3153, 'editorial',
             '{"weekly":{"mo":[{"start":"08:00","end":"18:00"}],"tu":[{"start":"08:00","end":"18:00"}],"we":[{"start":"08:00","end":"18:00"}]}}',
             '{"time_needed_min": 90}') RETURNING id`,
    [destinationId],
  );
  poiId = poi.rows[0]!.id;
  const trip = await db.pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, tz) VALUES ($1, 'setup', $2, 'Asia/Makassar')
     RETURNING id`,
    [crewId, destinationId],
  );
  tripId = trip.rows[0]!.id;
  const version = await db.pool.query<{ id: string }>(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  versionId = version.rows[0]!.id;
  const day = await db.pool.query<{ id: string }>(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-10-13'), ($1, $2, 2, '2026-10-14') RETURNING id",
    [versionId, tripId],
  );
  [cooking, forest] = [randomUUID(), randomUUID()];
  for (const [stable, from, to] of [
    [cooking, '10:00', '13:00'],
    [forest, '13:15', '14:15'],
  ] as const) {
    await db.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Makassar', 'other')`,
      [versionId, day.rows[0]!.id, tripId, stable, at('2026-10-13', from), at('2026-10-13', to)],
    );
  }
  await db.pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
    versionId,
    tripId,
  ]);
  await db.pool.query(
    `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
     VALUES ($1, $2, 'Tirta Empul', 'temple_shrine', -8.4153, 115.3153, $3, '{save}')`,
    [tripId, poiId, [people[0]]],
  );
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

const moveForest = (from: string, to: string) =>
  db.pool.query('UPDATE plan_items SET starts_at = $2, ends_at = $3 WHERE stable_id = $1', [
    forest,
    at('2026-10-13', from),
    at('2026-10-13', to),
  ]);

describe('plan check job', () => {
  it('a clean plan has nothing to fix, and every idea gets its fit', async () => {
    const outcome = await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, NOW);
    expect(outcome).toMatchObject({ outcome: 'checked', fix: 0, ideas: 1 });
    expect(await issues()).toEqual([]);
    const idea = await db.pool.query<{ fit: unknown; fit_version_id: string }>(
      'SELECT fit, fit_version_id FROM trip_ideas WHERE trip_id = $1',
      [tripId],
    );
    const fit = storedFitSchema.parse(idea.rows[0]?.fit);
    expect(fit.version_id).toBe(versionId);
    expect(fit.days).toHaveLength(2);
    const check = await db.pool.query(
      'SELECT fix_count, runs_today, status FROM plan_checks WHERE trip_id = $1',
      [tripId],
    );
    expect(check.rows[0]).toEqual({ fix_count: 0, runs_today: 1, status: 'done' });
  });

  it('an edit that makes a clash shows as a fix with a one-tap retime, keeping its id', async () => {
    await moveForest('12:00', '13:00');
    await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, NOW);
    const first = await issues();
    expect(first.map((issue) => [issue.kind, issue.fix?.kind])).toEqual([['clash', 'apply']]);
    await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, NOW);
    expect((await issues())[0]?.id).toBe(first[0]?.id);
  });

  it('reverting the edit clears the issue', async () => {
    await moveForest('13:15', '14:15');
    await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, NOW);
    expect(await issues()).toEqual([]);
  });

  it('holds back all but the daily run once the trip used its runs for the day', async () => {
    await db.pool.query(
      "UPDATE plan_checks SET runs_today = 96, runs_on = '2026-10-04' WHERE trip_id = $1",
      [tripId],
    );
    expect(await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, NOW)).toEqual({
      outcome: 'skipped',
      reason: 'daily_cap',
    });
    expect(await runPlanCheck(db.pool, { trip_id: tripId, trigger: 'daily' }, NOW)).toMatchObject({
      outcome: 'checked',
    });
  });

  it('a burst of plan changes queues one delayed run per trip', async () => {
    await withSystem(db.pool, async (tx) => {
      for (const type of ['plan.ops_applied', 'change_set.applied', 'trip_idea.saved']) {
        await planCheckEventHook(tx, { id: randomUUID(), type, tripId });
      }
      await planCheckEventHook(tx, { id: randomUUID(), type: 'chat.message_sent', tripId });
    });
    const { rows } = await db.pool.query<{ n: number; later: boolean }>(
      `SELECT count(*)::int AS n, bool_and(start_after > now() + interval '30 seconds') AS later
         FROM pgboss.job WHERE name = 'plan.check' AND data->>'trip_id' = $1`,
      [tripId],
    );
    expect(rows[0]).toEqual({ n: 1, later: true });
  });
});

describe('plan check stays deterministic', () => {
  it('nothing the job imports reaches the AI gateway', () => {
    const root = path.resolve(import.meta.dirname, '../../src/jobs/planning/check');
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/from '@cp\/ai'/u);
      for (const match of text.matchAll(/from '(\.{1,2}\/[^']+)'/gu)) {
        const target = path.resolve(path.dirname(file), match[1] ?? '');
        const candidates = [`${target}.ts`, path.join(target, 'index.ts')];
        const next = candidates.find((candidate) => {
          try {
            return statSync(candidate).isFile();
          } catch {
            return false;
          }
        });
        if (next !== undefined) visit(next);
      }
    };
    for (const entry of readdirSync(root).filter((name) => name.endsWith('.ts'))) {
      visit(path.join(root, entry));
    }
    expect(seen.size).toBeGreaterThan(4);
    const planner = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, '../../../../packages/planner/package.json'),
        'utf8',
      ),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(planner.dependencies ?? {})).not.toContain('@cp/ai');
  });
});
