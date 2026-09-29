/**
 * Rooms and must-dos on the real stack. Choosing the stay prices doubles and a single for an odd
 * crew from the cost index and seats the guide's grouping; a stale edit is rejected with the
 * version to rebase on, an overfull room is refused, and every change queues the cost recompute.
 * Locking rooms moves setup on and prompts each member for their must-do exactly once. A member
 * edits only their own must-dos, a place someone already has merges with both avatars, each change
 * queues the fit check, and tracking a lottery sets reminders without entering anything.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLockBudgetTargetCommand } from '../../src/commands/setup/lock-budget-target';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from './setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let poiId: string;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function jobs(name: string): Promise<number> {
  const { rowCount } = await harness.pool.query('SELECT 1 FROM pgboss.job WHERE name = $1', [name]);
  return rowCount ?? 0;
}

async function planVersion(): Promise<number> {
  const { rows } = await harness.pool.query<{ version: number }>(
    'SELECT version FROM room_plans WHERE trip_id = $1',
    [crew.tripId],
  );
  return rows[0]?.version ?? 0;
}

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (_app, deps) => {
    deps.registry.register(createLockBudgetTargetCommand({ redis: deps.redis }));
  });
  crew = await buildSetupCrew(harness, 5);
  await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ destination_id: string }>(
      'SELECT destination_id FROM trips WHERE id = $1',
      [crew.tripId],
    );
    const destinationId = rows[0]?.destination_id;
    await tx.query(
      `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
         nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
         reviewed_at)
       VALUES ($1, 'ryokan', 9000, 11000, 2750, 1250, 'USD', 'editorial', current_date, now()),
              ($1, 'apartment', 4000, 5000, 2750, 1250, 'USD', 'editorial', current_date, now())`,
      [destinationId],
    );
    const poi = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Fushimi Inari', 'temple_shrine', 34.97, 135.77) RETURNING id`,
      [destinationId],
    );
    poiId = poi.rows[0]?.id as string;
  });
  const [, rin, mei] = crew.members as [SignedIn, SignedIn, SignedIn];
  for (const member of [rin, mei]) {
    const prefs = await harness.run(member, 'set_room_prefs', {
      trip_id: crew.tripId,
      chips: ['light_sleeper'],
    });
    if (prefs.status !== 200) throw new Error(`set_room_prefs: ${JSON.stringify(prefs.body)}`);
  }
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('rooms', () => {
  it('prices doubles and a single, and seats the guide’s grouping', async () => {
    const early = await harness.run(crew.organiser, 'set_stay_choice', {
      trip_id: crew.tripId,
      stay_option_id: 'ryokan',
    });
    expect(errorOf(early)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'dates_not_locked' },
    });
    const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
      trip_id: crew.tripId,
      start: day(60),
      end: day(67),
    });
    expect(locked.status, JSON.stringify(locked.body)).toBe(200);
    const chosen = await harness.run(crew.organiser, 'set_stay_choice', {
      trip_id: crew.tripId,
      stay_option_id: 'ryokan',
      stays: [
        { stay_type: 'ryokan', nights: 2 },
        { stay_type: 'apartment', nights: 5 },
      ],
    });
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(200);
    const { rows } = await harness.pool.query<{
      rooms: { stay_key: string; capacity: number; nightly_minor: number }[];
    }>('SELECT rooms FROM room_plans WHERE trip_id = $1', [crew.tripId]);
    const ryokan = rows[0]?.rooms.filter((r) => r.stay_key === 'stay-1') ?? [];
    expect(ryokan.map((r) => [r.capacity, r.nightly_minor])).toEqual([
      [2, 22_000],
      [2, 22_000],
      [1, 11_000],
    ]);
    const [, rin, mei] = crew.members as [SignedIn, SignedIn, SignedIn];
    const together = await harness.pool.query<{ room_key: string; trait_label: string | null }>(
      "SELECT room_key, trait_label FROM room_assignments WHERE trip_id = $1 AND stay_key = 'stay-1' AND user_id = ANY($2)",
      [crew.tripId, [rin.uid, mei.uid]],
    );
    expect(new Set(together.rows.map((r) => r.room_key)).size).toBe(1);
    expect(together.rows[0]?.trait_label).toBe('light_sleepers');
    expect(await jobs('cost.recompute')).toBeGreaterThan(0);
  });

  it('rejects a stale edit with the version to rebase on, and an overfull room', async () => {
    const version = await planVersion();
    const [a, b, c, d, e] = crew.members.map((m) => m.uid) as [
      string,
      string,
      string,
      string,
      string,
    ];
    const layout = [
      { stay_key: 'stay-1', room_key: 'room-1', uids: [a, b] },
      { stay_key: 'stay-1', room_key: 'room-2', uids: [c, d] },
      { stay_key: 'stay-1', room_key: 'room-3', uids: [e] },
    ];
    const ok = await harness.run(crew.organiser, 'set_room_assignment', {
      trip_id: crew.tripId,
      base_version: version,
      rooms: layout,
    });
    expect(resultOf(ok)).toMatchObject({ version: version + 1 });
    const stale = await harness.run(crew.organiser, 'set_room_assignment', {
      trip_id: crew.tripId,
      base_version: version,
      rooms: layout,
    });
    expect(errorOf(stale)).toMatchObject({
      code: 'VERSION_CONFLICT',
      detail: { current_version: version + 1 },
    });
    const overfull = await harness.run(crew.organiser, 'set_room_assignment', {
      trip_id: crew.tripId,
      base_version: version + 1,
      rooms: [{ stay_key: 'stay-1', room_key: 'room-3', uids: [d, e] }],
    });
    expect(errorOf(overfull)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'over_capacity' },
    });
    const second = await harness.pool.query<{ user_id: string }>(
      "SELECT user_id FROM room_assignments WHERE trip_id = $1 AND stay_key = 'stay-2' AND room_key = 'room-1'",
      [crew.tripId],
    );
    expect(second.rows.map((r) => r.user_id).sort()).toEqual([a, b].sort());
  });

  it('lets a member ask to swap but not move anyone', async () => {
    const [, rin] = crew.members as [SignedIn, SignedIn];
    const asked = await harness.run(rin, 'request_room_swap', { trip_id: crew.tripId });
    expect(asked.status).toBe(200);
    const moved = await harness.run(rin, 'set_room_assignment', {
      trip_id: crew.tripId,
      base_version: await planVersion(),
      rooms: [{ stay_key: 'stay-1', room_key: 'room-3', uids: [rin.uid] }],
    });
    expect(errorOf(moved).code).toBe('FORBIDDEN');
  });

  it('moves setup on and prompts each member for a must-do exactly once', async () => {
    const budget = await harness.run(crew.organiser, 'lock_budget_target', {
      trip_id: crew.tripId,
      target_minor: 150_000,
    });
    expect(budget.status, JSON.stringify(budget.body)).toBe(200);
    const lock = await harness.run(crew.organiser, 'lock_rooms', { trip_id: crew.tripId });
    expect(lock.status, JSON.stringify(lock.body)).toBe(200);
    const prompts = async () =>
      (
        await harness.pool.query(
          "SELECT 1 FROM domain_events WHERE type = 'must_do.prompted' AND trip_id = $1",
          [crew.tripId],
        )
      ).rowCount;
    expect(await prompts()).toBe(5);
    await harness.run(crew.organiser, 'set_setup_step', { trip_id: crew.tripId, step: 'rooms' });
    await harness.run(crew.organiser, 'lock_rooms', { trip_id: crew.tripId });
    expect(await prompts()).toBe(5);
  });
});

describe('must-dos', () => {
  it('keeps each member to their own list and merges a place someone already has', async () => {
    const [organiser, rin] = crew.members as [SignedIn, SignedIn];
    const mine = await harness.run(organiser, 'set_must_dos', {
      trip_id: crew.tripId,
      items: [
        { poi_id: poiId, text: 'Fushimi Inari', priority: 0 },
        { text: 'Eat the best ramen', priority: 1 },
      ],
    });
    const { must_do_ids: ids } = resultOf<{ must_do_ids: string[] }>(mine);
    expect(ids).toHaveLength(2);
    const theirs = await harness.run(rin, 'set_must_dos', {
      trip_id: crew.tripId,
      items: [{ poi_id: poiId, text: 'Fushimi Inari', priority: 0 }],
    });
    const [fushimi] = (
      await harness.pool.query<{ id: string }>(
        'SELECT id FROM must_dos WHERE poi_id = $1 AND owner_id = $2',
        [poiId, organiser.uid],
      )
    ).rows;
    expect(resultOf<{ must_do_ids: string[] }>(theirs).must_do_ids).toEqual([fushimi?.id]);
    const merged = await harness.pool.query<{ owner_id: string; co_owner_ids: string[] }>(
      'SELECT owner_id, co_owner_ids FROM must_dos WHERE poi_id = $1 AND deleted_at IS NULL',
      [poiId],
    );
    expect(merged.rows).toEqual([{ owner_id: organiser.uid, co_owner_ids: [rin.uid] }]);
    const emptied = await harness.run(rin, 'set_must_dos', { trip_id: crew.tripId, items: [] });
    expect(emptied.status).toBe(200);
    const still = await harness.pool.query(
      'SELECT 1 FROM must_dos WHERE owner_id = $1 AND deleted_at IS NULL',
      [organiser.uid],
    );
    expect(still.rowCount).toBe(2);
    expect(await jobs('ai.fit_check')).toBeGreaterThan(0);
  });

  it('tracks a lottery with reminders and never an entry', async () => {
    const [organiser] = crew.members as [SignedIn];
    const { rows } = await harness.pool.query<{ id: string }>(
      "SELECT id FROM must_dos WHERE owner_id = $1 AND title = 'Eat the best ramen'",
      [organiser.uid],
    );
    const tracked = await harness.run(organiser, 'track_lottery', {
      must_do_id: rows[0]?.id,
      deadline: day(30),
      result_date: day(40),
    });
    expect(resultOf(tracked)).toMatchObject({ reminders: ['deadline', 'result'] });
    const reminders = await harness.pool.query(
      "SELECT 1 FROM reminders WHERE user_id = $1 AND target_kind = 'must_do'",
      [organiser.uid],
    );
    expect(reminders.rowCount).toBe(2);
    const timers = await harness.pool.query(
      "SELECT 1 FROM scheduled_events WHERE kind = 'setup.lottery_remind' AND ref_id = $1",
      [rows[0]?.id],
    );
    expect(timers.rowCount).toBe(2);
  });
});
