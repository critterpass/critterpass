/**
 * The budget step in a crew that does not settle in dollars, on the real stack. The step is an
 * amount the crew would say out loud in its own currency (500,000 ₫; the round amount nearest $50
 * where a currency has no step of its own) and the server is its only authority: the band
 * read hands it out below four maxes alongside the counts, a target on it locks into a plan in the
 * crew currency, and a target off it is refused with the step and uses up none of the organiser's
 * hourly tries. The rates are the newest of each currency, so a newer day that has only the
 * dollar in yet changes nothing; and a crew whose currency has no rate at all gets no step and no
 * lock, never a dollar-sized grid. With the stay, food and fun priced but no fare for the dates,
 * the plan's breakdown puts the whole target on the ground part.
 */
import { BUDGET_LOCKS_PER_HOUR } from '@cp/domain';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLockBudgetTargetCommand } from '../../src/commands/setup/lock-budget-target';
import { registerBudgetRoutes } from '../../src/setup/budget-band-route';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from './setup-harness';

// One euro buys 1.25 dollars, so $50 is €40: S$64.00 at the rates below, which steps in S$50.
// Đồng steps in half millions whatever the rates say.
const RATES = { USD: '1.25', VND: '32500', SGD: '1.6' } as const;
const CREWS = [
  { currency: 'VND', stepMinor: 500_000, targetMinor: 26_000_000 },
  { currency: 'SGD', stepMinor: 5_000, targetMinor: 190_000 },
] as const;

let harness: SetupHarness;
const crews = new Map<string, SetupCrew>();

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, deps) => {
    deps.registry.register(createLockBudgetTargetCommand({ redis: deps.redis }));
    registerBudgetRoutes(app, deps);
  });
  await withSystem(harness.pool, async (tx) => {
    for (const [quote, rate] of Object.entries(RATES)) {
      await tx.query(
        `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
         VALUES ('EUR', $1, $2, '2026-09-30', 'frankfurter')`,
        [quote, rate],
      );
    }
    // The next day's rows so far: the dollar alone. The dong and Singapore rates are a day older.
    await tx.query(
      `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
       VALUES ('EUR', 'USD', $1, '2026-10-01', 'frankfurter')`,
      [RATES.USD],
    );
  });
  for (const { currency } of CREWS) {
    const crew = await buildSetupCrew(harness, 2);
    await withSystem(harness.pool, async (tx) => {
      await tx.query('UPDATE crews SET settlement_currency = $2 WHERE id = $1', [
        crew.crewId,
        currency,
      ]);
      // Three days from 2 April, a reviewed cost index in dollars, and no fare for anyone.
      await tx.query(
        "UPDATE trips SET start_date = '2027-04-02', end_date = '2027-04-04' WHERE id = $1",
        [crew.tripId],
      );
      await tx.query(
        `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
           nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
           reviewed_at)
         SELECT destination_id, 'hotel', 1500, 5000, 2000, 1000, 'USD', 'editorial', current_date,
                now()
           FROM trips WHERE id = $1`,
        [crew.tripId],
      );
    });
    crews.set(currency, crew);
  }
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe.each(CREWS)('a crew settling in $currency', ({ currency, stepMinor, targetMinor }) => {
  const crew = (): SetupCrew => crews.get(currency) as SetupCrew;
  const lock = (target: number) =>
    harness.run(crew().organiser, 'lock_budget_target', {
      trip_id: crew().tripId,
      target_minor: target,
    });

  it('reads the crew currency and the step with the counts, below four maxes', async () => {
    const response = await harness.request(`/v1/budget/${crew().tripId}/band`, {
      headers: { cookie: crew().organiser.cookie },
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; detail: unknown } };
    expect(body.error.code).toBe('K_ANON_UNAVAILABLE');
    expect(body.error.detail).toEqual({
      maxes_count: expect.any(Number) as number,
      member_count: expect.any(Number) as number,
      currency,
      step_minor: stepMinor,
    });
  });

  it('refuses a target off the step with the step, without using up a try', async () => {
    // Half a step off the grid, as a device still stepping in converted dollars would send.
    for (let i = 0; i <= BUDGET_LOCKS_PER_HOUR; i += 1) {
      const refused = await lock(targetMinor + stepMinor / 2);
      expect(refused.status).toBe(422);
      expect(errorOf(refused)).toMatchObject({
        code: 'VALIDATION',
        detail: { reason: 'off_step', step_minor: stepMinor },
      });
    }
  });

  it('locks a target on the step into a plan in the crew currency', async () => {
    const locked = await lock(targetMinor);
    expect(resultOf(locked)).toEqual({
      trip_id: crew().tripId,
      target_minor: targetMinor,
      currency,
      checked_against_band: false,
    });
    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query<{
        target_minor: string;
        currency: string;
        setup_step: string;
        breakdown: Record<string, number>;
      }>(
        `SELECT p.target_minor, p.currency, t.setup_step, p.breakdown
           FROM budget_plans p JOIN trips t ON t.id = p.trip_id WHERE p.trip_id = $1`,
        [crew().tripId],
      ),
    );
    expect(rows[0]).toMatchObject({ target_minor: String(targetMinor), currency });
    // No fare for these dates: nothing is set aside for flights, and the three priced parts
    // (the stay, food at $20 a day, fun) take the whole target.
    const breakdown = rows[0]?.breakdown ?? {};
    expect(breakdown['flights']).toBe(0);
    expect(breakdown['stays']).toBeGreaterThan(0);
    expect(breakdown['food']).toBeGreaterThan(0);
    expect((breakdown['stays'] ?? 0) + (breakdown['food'] ?? 0) + (breakdown['fun'] ?? 0)).toBe(
      targetMinor,
    );
  });
});

describe('a crew settling in a currency with no rate', () => {
  let crew: SetupCrew;

  beforeAll(async () => {
    crew = await buildSetupCrew(harness, 2);
    await withSystem(harness.pool, (tx) =>
      tx.query("UPDATE crews SET settlement_currency = 'THB' WHERE id = $1", [crew.crewId]),
    );
  });

  it('reads the currency with no step', async () => {
    const response = await harness.request(`/v1/budget/${crew.tripId}/band`, {
      headers: { cookie: crew.organiser.cookie },
    });
    const body = (await response.json()) as { error: { code: string; detail: object } };
    expect(body.error.code).toBe('K_ANON_UNAVAILABLE');
    expect(body.error.detail).toMatchObject({ currency: 'THB' });
    expect(body.error.detail).not.toHaveProperty('step_minor');
  });

  it('locks nothing, rather than a target on a dollar-sized grid', async () => {
    const refused = await harness.run(crew.organiser, 'lock_budget_target', {
      trip_id: crew.tripId,
      target_minor: 100_000,
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'rates_unavailable' },
    });
    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query('SELECT 1 FROM budget_plans WHERE trip_id = $1', [crew.tripId]),
    );
    expect(rows).toEqual([]);
  });
});
