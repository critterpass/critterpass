/**
 * What a new plan version keeps, on the real stack: an organiser's one-tap fix makes a new version
 * and, in the same transaction, the stored legs of the pairs it left alone are there under the new
 * version with the minutes they had, the check's finding on the untouched day keeps its id, the
 * finding on the changed day is gone, and the crew's check waits for its next run. A pair whose
 * place changed, or that is no longer next to each other, is left for the legs job. "Keep it as
 * it is" on an organiser's private draft is refused.
 */
import { randomUUID } from 'node:crypto';

import { onEventAppended, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCheckCommands } from '../../../src/commands/checks';
import { carryLegs } from '../../../src/commands/checks/carry-forward';
import { planStaySource } from '../../../src/planning/fit/context';
import { legsEventHook } from '../../../src/planning/legs';
import { seedCurrentPlan, tokyo, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

const deps = { stays: planStaySource, now: () => new Date() };
let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;
let gallery: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function current(): Promise<{ versionId: string; days: string[] }> {
  const rows = await q<{ version: string; day: string }>(
    `SELECT t.current_version_id AS version, d.id AS day FROM trips t
       JOIN plan_days d ON d.version_id = t.current_version_id WHERE t.id = $1 ORDER BY d.day_no`,
    [crew.tripId],
  );
  return { versionId: rows[0]!.version, days: rows.map((row) => row.day) };
}

const legsOf = (versionId: string) =>
  q<{ pair: string; minutes: number; day_id: string; source: string }>(
    `SELECT from_key || '>' || to_key AS pair, minutes, day_id, source FROM plan_legs
      WHERE version_id = $1 ORDER BY 1`,
    [versionId],
  );

async function leg(versionId: string, dayId: string, from: string, to: string, minutes: number) {
  await q(
    `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters,
                            source, approx)
     VALUES ($1, $2, $3, $4, $5, 'drive', $6, 5000, 'valhalla', false)`,
    [crew.tripId, versionId, dayId, from, to, minutes],
  );
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => registerCheckCommands(registry, deps));
  onEventAppended(legsEventHook);
  crew = await buildSetupCrew(harness, 2);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
  // Every stop gets a place, and day 2 a second stop, so both days have a pair.
  const spots: Record<string, [number, number]> = {
    [plan.walk]: [35.0116, 135.7681],
    [plan.dinner]: [35.0037, 135.7788],
    [plan.museum]: [35.0122, 135.7722],
  };
  for (const [stable, [lat, lng]] of Object.entries(spots)) {
    await q('UPDATE plan_items SET custom_place = $2 WHERE stable_id = $1', [
      stable,
      JSON.stringify({ name: 'A place', lat, lng }),
    ]);
  }
  gallery = randomUUID();
  await q(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
       category, custom_place)
     SELECT version_id, day_id, trip_id, $2, $3, $4, tz, category, $5
       FROM plan_items WHERE stable_id = $1`,
    [
      plan.museum,
      gallery,
      tokyo(plan.dates[1]!, 14),
      tokyo(plan.dates[1]!, 15),
      JSON.stringify({ name: 'A gallery', lat: 35.0269, lng: 135.7982 }),
    ],
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('a new plan version', () => {
  it('keeps the legs of unchanged pairs and the findings of untouched days', async () => {
    const before = await current();
    await leg(before.versionId, before.days[0]!, plan.walk, plan.dinner, 25);
    await leg(before.versionId, before.days[1]!, plan.museum, gallery, 9);
    const date = plan.dates[0]!;
    const [clash] = await q<{ id: string }>(
      `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, stable_ids,
         params, fix, rank, fingerprint)
       VALUES ($1, $2, 'clash', 'fix', $3, $4::uuid[], $5, $6, 0, $7) RETURNING id`,
      [
        crew.tripId,
        before.versionId,
        before.days[0],
        [plan.walk, plan.dinner],
        JSON.stringify({ first: plan.walk, second: plan.dinner, short_minutes: 30 }),
        JSON.stringify({
          kind: 'apply',
          ops: [
            {
              op: 'retime',
              target: plan.walk,
              before: { starts_at: tokyo(date, 9), ends_at: tokyo(date, 11) },
              after: { starts_at: tokyo(date, 12), ends_at: tokyo(date, 14) },
              reason: 'check_fix_clash',
              affected_user_ids: [],
              booking_impact: false,
            },
          ],
        }),
        `clash:${before.days[0]}:x`,
      ],
    );
    const [pace] = await q<{ id: string }>(
      `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, params, rank,
         fingerprint)
       VALUES ($1, $2, 'pace', 'know', $3, '{"stops": 6, "limit": 6}', 1, $4) RETURNING id`,
      [crew.tripId, before.versionId, before.days[1], `pace:${before.days[1]}:`],
    );
    await q(
      `INSERT INTO plan_checks (trip_id, version_id, status, checked_at, fix_count, know_count)
       VALUES ($1, $2, 'done', now(), 1, 1)`,
      [crew.tripId, before.versionId],
    );

    const applied = await harness.run(crew.organiser, 'apply_check_fix', {
      issue_id: clash!.id,
      base_version: before.versionId,
    });
    expect(resultOf<{ applied: boolean }>(applied).applied).toBe(true);

    const after = await current();
    expect(after.versionId).not.toBe(before.versionId);
    // The walk moved within its day: both pairs are the pairs they were, minutes and all.
    expect(await legsOf(after.versionId)).toEqual(
      [
        {
          pair: `${plan.walk}>${plan.dinner}`,
          minutes: 25,
          day_id: after.days[0],
          source: 'valhalla',
        },
        {
          pair: `${plan.museum}>${gallery}`,
          minutes: 9,
          day_id: after.days[1],
          source: 'valhalla',
        },
      ].sort((a, b) => (a.pair < b.pair ? -1 : 1)),
    );
    const issues = await q<{ id: string; version_id: string; day_id: string; fingerprint: string }>(
      'SELECT id, version_id, day_id, fingerprint FROM plan_check_issues WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(issues).toEqual([
      {
        id: pace!.id,
        version_id: after.versionId,
        day_id: after.days[1],
        fingerprint: `pace:${after.days[1]}:`,
      },
    ]);
    const [check] = await q(
      'SELECT version_id, status, fix_count, know_count FROM plan_checks WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(check).toEqual({
      version_id: after.versionId,
      status: 'queued',
      fix_count: 0,
      know_count: 1,
    });
  });

  it('leaves a pair for the legs job when its place changed or the stops are no longer neighbours', async () => {
    const { versionId } = await current();
    // A stop between the museum and the gallery, and the walk at another place.
    await q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         category, custom_place)
       SELECT version_id, day_id, trip_id, $2, $3, $4, tz, category, custom_place
         FROM plan_items WHERE stable_id = $1 AND version_id = $5`,
      [plan.museum, randomUUID(), tokyo(plan.dates[1]!, 12), tokyo(plan.dates[1]!, 13), versionId],
    );
    await q(
      `UPDATE plan_items SET custom_place = '{"name": "Elsewhere", "lat": 35.1, "lng": 135.7}'
        WHERE stable_id = $1 AND version_id = $2`,
      [plan.walk, versionId],
    );
    await q('DELETE FROM plan_legs WHERE version_id = $1', [versionId]);
    // The version before still has both legs; neither may come over.
    const [old] = await q<{ n: number }>(
      'SELECT count(*)::int AS n FROM plan_legs WHERE trip_id = $1 AND version_id <> $2',
      [crew.tripId, versionId],
    );
    expect(old?.n).toBe(2);
    const carried = await withSystem(harness.pool, (tx) => carryLegs(tx, crew.tripId));
    expect(carried).toBe(0);
    expect(await legsOf(versionId)).toEqual([]);
  });
});

describe('keep_check_issue on a private draft', () => {
  it('is refused, and leaves the crew’s check row as it was', async () => {
    const [draft] = await q<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status)
       VALUES ($1, 'organiser', 'draft') RETURNING id`,
      [crew.tripId],
    );
    const [issue] = await q<{ id: string }>(
      `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, stable_ids, params,
         rank, fingerprint)
       VALUES ($1, $2, 'clash', 'fix', $3::uuid[], $4, 0, 'clash:-:draft') RETURNING id`,
      [
        crew.tripId,
        draft!.id,
        [plan.walk, plan.dinner],
        JSON.stringify({ first: plan.walk, second: plan.dinner, short_minutes: 10 }),
      ],
    );
    const refused = await harness.run(crew.organiser, 'keep_check_issue', {
      issue_id: issue!.id,
      base_version: draft!.id,
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'private_draft' },
    });
    const [check] = await q<{ quiet: unknown[] }>(
      'SELECT quiet FROM plan_checks WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(check?.quiet).toEqual([]);
    expect(await q('SELECT 1 FROM plan_check_issues WHERE id = $1', [issue!.id])).toHaveLength(1);
  });
});
