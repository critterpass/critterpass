/**
 * `apply_plan_ops` on the real stack: a member is told to propose instead; an organiser's move
 * lands as a new current version the crew hears about; a booked item needs the confirmation and a
 * booked day never moves; and two edits racing on one base version end with exactly one version
 * and one `PLAN_VERSION_CONFLICT` naming it.
 */
import { withSystem } from '@cp/db';
import { guideText, guideTextSourceHash } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPlanCommands } from '../../src/commands/plan';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../setup/setup-harness';
import { seedCurrentPlan, tokyo, type SeededPlan } from './plan-fixture';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;

const current = async (): Promise<string> => {
  const { rows } = await harness.pool.query<{ v: string }>(
    'SELECT current_version_id AS v FROM trips WHERE id = $1',
    [crew.tripId],
  );
  return rows[0]?.v as string;
};

const moveWalk = (who: SignedIn, base: string, hour: number, extra: Record<string, unknown> = {}) =>
  harness.run(who, 'apply_plan_ops', {
    trip_id: crew.tripId,
    base_version: base,
    ops: [
      {
        op: 'move',
        item: plan.walk,
        new: {
          starts_at: tokyo(plan.dates[0] as string, hour),
          ends_at: tokyo(plan.dates[0] as string, hour + 1),
        },
      },
    ],
    ...extra,
  });

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 2);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('apply_plan_ops', () => {
  it('sends a member to a change set and commits an organiser edit as a new version', async () => {
    const [, member] = crew.members as [SignedIn, SignedIn];
    expect(errorOf(await moveWalk(member, plan.versionId, 11))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'use_changeset' },
    });

    const applied = await moveWalk(crew.organiser, plan.versionId, 11);
    expect(applied.status).toBe(200);
    const { version_id: versionId } = resultOf<{ version_id: string }>(applied);
    expect(await current()).toBe(versionId);
    const { rows } = await harness.pool.query<{ status: string; starts: Date; items: number }>(
      `SELECT (SELECT status FROM itinerary_versions WHERE id = $1) AS status,
              (SELECT starts_at FROM plan_items WHERE version_id = $2 AND stable_id = $3) AS starts,
              (SELECT count(*)::int FROM plan_items WHERE version_id = $2) AS items`,
      [plan.versionId, versionId, plan.walk],
    );
    expect(rows[0]).toMatchObject({ status: 'superseded', items: 3 });
    expect(rows[0]?.starts.toISOString()).toBe(tokyo(plan.dates[0] as string, 11));
    const hints = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1",
      [`trip_plan:${crew.tripId}`],
    );
    expect(hints.rows.map((r) => r.type)).toContain('plan.ops');
    const jobs = await harness.pool.query<{ name: string }>(
      "SELECT DISTINCT name FROM pgboss.job WHERE name IN ('plan.stale_sweep', 'cost.recompute')",
    );
    expect(jobs.rows.map((r) => r.name).sort()).toEqual(['cost.recompute', 'plan.stale_sweep']);

    expect(errorOf(await moveWalk(crew.organiser, plan.versionId, 12))).toMatchObject({
      code: 'PLAN_VERSION_CONFLICT',
      detail: { latest: versionId },
    });
  });

  it('asks before moving a booked item and never moves a booked day', async () => {
    const base = await current();
    const moveDinner = (confirm: boolean) =>
      harness.run(crew.organiser, 'apply_plan_ops', {
        trip_id: crew.tripId,
        base_version: base,
        ops: [{ op: 'move', item: plan.dinner, new: { day_no: 2 } }],
        confirm_locked: confirm,
      });
    expect(errorOf(await moveDinner(false))).toMatchObject({
      code: 'STATE_INVALID',
      detail: {
        reason: 'locked_item',
        items: [{ stable_id: plan.dinner, locked_reason: 'booking' }],
      },
    });
    const reorder = await harness.run(crew.organiser, 'apply_plan_ops', {
      trip_id: crew.tripId,
      base_version: base,
      ops: [{ op: 'reorder_days', new: { order: [2, 1, 3] } }],
      confirm_locked: true,
    });
    expect(errorOf(reorder)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'booked_day_fixed', day_no: 1 },
    });
    expect((await moveDinner(true)).status).toBe(200);
  });

  it('lets exactly one of two racing edits on the same base through', async () => {
    const base = await current();
    const answers = await Promise.all([
      moveWalk(crew.organiser, base, 13),
      moveWalk(crew.organiser, base, 14),
    ]);
    const ok = answers.filter((a) => a.status === 200);
    const conflicts = answers.filter((a) => errorOf(a).code === 'PLAN_VERSION_CONFLICT');
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    const winner = resultOf<{ version_id: string }>(ok[0] as { body: Record<string, unknown> });
    expect(errorOf(conflicts[0] as { body: Record<string, unknown> }).detail).toEqual({
      latest: winner.version_id,
    });
    expect(await current()).toBe(winner.version_id);
  });

  it("keeps the guide's translations with their text through an organiser's edit", async () => {
    const base = await current();
    const note = 'Quiet rooms first: the crowds come at 11:00.';
    const noteVi = 'Vào các phòng yên tĩnh trước: 11:00 mới đông.';
    await withSystem(harness.pool, async (tx) => {
      await tx.query(
        `UPDATE plan_items SET notes = $3, created_by_kind = 'guide', i18n = $4
          WHERE version_id = $1 AND stable_id = $2`,
        [
          base,
          plan.museum,
          note,
          { _src: guideTextSourceHash('plan_item', { notes: note }), vi: { notes: noteVi } },
        ],
      );
      await tx.query('UPDATE plan_days SET i18n = $2 WHERE version_id = $1 AND day_no = 3', [
        base,
        { _src: guideTextSourceHash('plan_day', { theme: 'Day 3' }), vi: { theme: 'Ngày 3' } },
      ]);
    });

    // Days 1 and 3 swap (day 2 holds the booking): each theme takes its translations along.
    const reordered = await harness.run(crew.organiser, 'apply_plan_ops', {
      trip_id: crew.tripId,
      base_version: base,
      ops: [{ op: 'reorder_days', new: { order: [3, 2, 1] } }],
    });
    expect(reordered.status).toBe(200);
    const next = await current();
    expect(next).not.toBe(base);
    const days = await harness.pool.query<{ theme: string; i18n: unknown }>(
      'SELECT theme, i18n FROM plan_days WHERE version_id = $1 ORDER BY day_no',
      [next],
    );
    expect(
      days.rows.map((row) => guideText('plan_day', { theme: row.theme }, row.i18n, 'theme', 'vi')),
    ).toEqual(['Ngày 3', 'Day 2', 'Day 1']);
    const item = await harness.pool.query<{ notes: string; i18n: unknown }>(
      'SELECT notes, i18n FROM plan_items WHERE version_id = $1 AND stable_id = $2',
      [next, plan.museum],
    );
    expect(
      item.rows.map((row) => guideText('plan_item', { notes: row.notes }, row.i18n, 'notes', 'vi')),
    ).toEqual([noteVi]);
  });

  it("keeps the plan's own place names, and adds the name of a place a new stop points at", async () => {
    const base = await current();
    const kept = '00000000-0000-4000-8000-0000000000a1';
    const { rows: dest } = await harness.pool.query<{ destination_id: string | null }>(
      'SELECT destination_id FROM trips WHERE id = $1',
      [crew.tripId],
    );
    const placeId = await withSystem(harness.pool, async (tx) => {
      const destinationId =
        dest[0]?.destination_id ??
        (
          await tx.query<{ id: string }>(
            "INSERT INTO destinations (slug, name, tz) VALUES ('coverage-test', 'Coverage test', 'Asia/Ho_Chi_Minh') RETURNING id",
          )
        ).rows[0]!.id;
      // An open-data place, which phones never carry in their catalogue.
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
         VALUES ($1, 'Di sản Văn hóa Thế Giới Mỹ Sơn', 'other', 15.76, 108.12, 'auto') RETURNING id`,
        [destinationId],
      );
      await tx.query('UPDATE itinerary_versions SET coverage = $2 WHERE id = $1', [
        base,
        {
          places: {
            [kept]: {
              name: 'Fushimi Inari',
              category: 'sight',
              lat: 35,
              lng: 135,
              editorial: true,
            },
          },
        },
      ]);
      return rows[0]!.id;
    });
    const added = await harness.run(crew.organiser, 'apply_plan_ops', {
      trip_id: crew.tripId,
      base_version: base,
      ops: [
        {
          op: 'add',
          item: '00000000-0000-4000-8000-0000000000b1',
          new: {
            day_no: 2,
            starts_at: tokyo(plan.dates[1] as string, 15),
            ends_at: tokyo(plan.dates[1] as string, 17),
            tz: 'Asia/Tokyo',
            status: 'confirmed',
            poi_id: placeId,
            category: 'other',
          },
        },
      ],
    });
    expect(added.status).toBe(200);
    const { rows } = await harness.pool.query<{ places: Record<string, { name: string }> }>(
      "SELECT coverage->'places' AS places FROM itinerary_versions WHERE id = $1",
      [await current()],
    );
    expect(rows[0]?.places[kept]?.name).toBe('Fushimi Inari');
    expect(rows[0]?.places[placeId]).toMatchObject({
      name: 'Di sản Văn hóa Thế Giới Mỹ Sơn',
      editorial: false,
    });
  });

  it("carries a dropped pin's own place and the plan's place names through a later edit", async () => {
    const pin = '00000000-0000-4000-8000-0000000000c1';
    const customPlace = { name: 'Bánh mì cart by the bridge', lat: 16.0614, lng: 108.2272 };
    const added = await harness.run(crew.organiser, 'apply_plan_ops', {
      trip_id: crew.tripId,
      base_version: await current(),
      ops: [
        {
          op: 'add',
          item: pin,
          new: {
            day_no: 2,
            starts_at: tokyo(plan.dates[1] as string, 18),
            ends_at: tokyo(plan.dates[1] as string, 19),
            tz: 'Asia/Tokyo',
            status: 'confirmed',
            category: 'food',
            custom_place: customPlace,
          },
        },
      ],
    });
    expect(added.status).toBe(200);
    const before = await harness.pool.query<{ places: Record<string, unknown> }>(
      "SELECT coverage->'places' AS places FROM itinerary_versions WHERE id = $1",
      [await current()],
    );
    const names = before.rows[0]?.places ?? {};
    expect(Object.keys(names).length).toBeGreaterThan(0);

    // Another edit makes another version: the pin and the plan's place names both carry over.
    const moved = await harness.run(crew.organiser, 'apply_plan_ops', {
      trip_id: crew.tripId,
      base_version: await current(),
      ops: [
        {
          op: 'move',
          item: pin,
          new: {
            starts_at: tokyo(plan.dates[1] as string, 20),
            ends_at: tokyo(plan.dates[1] as string, 21),
          },
        },
      ],
    });
    expect(moved.status).toBe(200);
    const next = await current();
    const { rows } = await harness.pool.query<{ custom_place: unknown; poi_id: string | null }>(
      'SELECT custom_place, poi_id FROM plan_items WHERE version_id = $1 AND stable_id = $2',
      [next, pin],
    );
    expect(rows).toEqual([{ custom_place: customPlace, poi_id: null }]);
    const after = await harness.pool.query<{ places: Record<string, unknown> }>(
      "SELECT coverage->'places' AS places FROM itinerary_versions WHERE id = $1",
      [next],
    );
    expect(after.rows[0]?.places).toEqual(names);
  });

  it("reorders a crew plan's days inside one stop and refuses a day carried across stops", async () => {
    const reorder = async (order: number[]) =>
      harness.run(crew.organiser, 'apply_plan_ops', {
        trip_id: crew.tripId,
        base_version: await current(),
        ops: [{ op: 'reorder_days', new: { order } }],
      });
    const stops = (first: number, second: number) =>
      harness.pool.query(
        `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
         SELECT t.id, t.crew_id, s.position, t.destination_id, s.nights
           FROM trips t, unnest($2::int[]) WITH ORDINALITY AS s(nights, position)
          WHERE t.id = $1
         ON CONFLICT (trip_id, position) DO UPDATE SET nights = EXCLUDED.nights`,
        [crew.tripId, [first, second]],
      );
    try {
      // Day 1 is the first stop's, days 2 and 3 the second's: days 1 and 3 cannot swap.
      await stops(1, 1);
      expect(errorOf(await reorder([3, 2, 1]))).toMatchObject({
        code: 'STATE_INVALID',
        detail: { reason: 'stop_day_fixed', day_no: 3 },
      });
      // All three days in the first stop: the same swap is taken.
      await stops(3, 1);
      expect((await reorder([3, 2, 1])).status).toBe(200);
    } finally {
      await harness.pool.query('DELETE FROM trip_stops WHERE trip_id = $1', [crew.tripId]);
    }
  });
});
