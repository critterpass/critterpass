/**
 * Leaving the rooms step without a plan, on the real stack. A crew of three in a place with no
 * reviewed stay rates has nothing to plan rooms from, so the organiser may move on and the stay
 * splits evenly. Once the place has stay rates, the same move is refused until the rooms are
 * locked: three people do not share one room by default.
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
} from './setup-harness';

let harness: SetupHarness;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** A crew of three whose setup has reached the rooms step. */
async function crewAtRooms(): Promise<SetupCrew> {
  const crew = await buildSetupCrew(harness, 3);
  const dates = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(30),
    end: day(33),
  });
  expect(resultOf<{ step: string }>(dates).step).toBe('budget');
  const budget = await harness.run(crew.organiser, 'lock_budget_target', {
    trip_id: crew.tripId,
    target_minor: 100_000,
  });
  expect(resultOf(budget)).toMatchObject({ target_minor: 100_000 });
  return crew;
}

const skipRooms = (crew: SetupCrew) =>
  harness.run(crew.organiser, 'set_setup_step', { trip_id: crew.tripId, step: 'must_dos' });

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (_app, deps) => {
    deps.registry.register(createLockBudgetTargetCommand({ redis: deps.redis }));
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('moving past rooms with no room plan', () => {
  it('is allowed where the place has no stay rates to plan rooms from', async () => {
    const crew = await crewAtRooms();
    expect(resultOf(await skipRooms(crew))).toEqual({ trip_id: crew.tripId, step: 'must_dos' });
  });

  it('is refused for a crew of three once the place has stay rates', async () => {
    const crew = await crewAtRooms();
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
           nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
           reviewed_at)
         SELECT destination_id, 'hotel', 4000, 6000, 3000, 1500, 'USD', 'editorial', current_date,
                now()
           FROM trips WHERE id = $1`,
        [crew.tripId],
      ),
    );
    const refused = await skipRooms(crew);
    expect(errorOf(refused)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'step_not_done', step: 'rooms' },
    });
  });

  it('does not count stay rates nobody has reviewed', async () => {
    const crew = await crewAtRooms();
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
           nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on)
         SELECT destination_id, 'hotel', 4000, 6000, 3000, 1500, 'USD', 'editorial', current_date
           FROM trips WHERE id = $1`,
        [crew.tripId],
      ),
    );
    expect(resultOf(await skipRooms(crew))).toEqual({ trip_id: crew.tripId, step: 'must_dos' });
  });
});
