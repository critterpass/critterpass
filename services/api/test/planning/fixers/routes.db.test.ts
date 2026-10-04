/**
 * The fixer routes on the real stack: Less driving and Rain and crowds answer for one day of the
 * plan as a participant sees it (stops in the day's order, nothing booked moved), and someone
 * outside the trip gets `NOT_FOUND`.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planStaySource } from '../../../src/planning/fit/context';
import { registerFixerRoutes } from '../../../src/planning/fixers/routes';
import { seedCurrentPlan, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;
let dayId: string;
let stranger: SignedIn;

const get = (who: SignedIn, path: string) =>
  harness.request(`/v1/trips/${crew.tripId}/days/${dayId}/${path}`, {
    headers: { cookie: who.cookie },
  });

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, doors) =>
    registerFixerRoutes(app, doors, { stays: planStaySource, now: () => new Date() }),
  );
  crew = await buildSetupCrew(harness, 2);
  stranger = await harness.signIn();
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
  dayId = await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id FROM plan_days WHERE version_id = $1 AND day_no = 1',
      [plan.versionId],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('fixer routes', () => {
  it('answers less driving for the day, offering nothing when no order is shorter', async () => {
    const response = await get(crew.organiser, 'reorder');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ day_id: dayId, found: false });
  });

  it('answers rain and crowds with the day in its NOW lane and nothing booked moved', async () => {
    const response = await get(crew.organiser, 'swaps');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      now: { stable_id: string }[];
      swaps: { stable_id: string }[];
      weather: unknown;
    };
    expect(body.now.map((block) => block.stable_id).sort()).toEqual(
      [plan.walk, plan.dinner].sort(),
    );
    expect(body.swaps.some((swap) => swap.stable_id === plan.dinner)).toBe(false);
    expect(body.weather).toBeNull();
  });

  it('is NOT_FOUND to anyone outside the trip', async () => {
    expect((await get(stranger, 'reorder')).status).toBe(404);
    expect((await get(stranger, 'swaps')).status).toBe(404);
    expect((await get(stranger, 'too-far')).status).toBe(404);
  });
});
