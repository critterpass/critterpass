/**
 * Changing a driver link on the real stack: any crew member narrows its days, moves its expiry
 * (counted from now) or turns quotes off; days the plan does not have are dropped, a change that
 * leaves no day is refused, a revoked link stays revoked, and nobody outside the crew can touch it.
 */
import { randomBytes } from 'node:crypto';

import { generateUuidV7, type DriverPlanShare } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerChangesetCommands } from '../../src/commands/changesets';
import { registerDriverPlanShares } from '../../src/commands/driver-plan-shares';
import { seedCurrentPlan } from '../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../setup/setup-harness';

const DAY_MS = 86_400_000;

let harness: SetupHarness;
let crew: SetupCrew;
let organiser: SignedIn;
let member: SignedIn;
let made: DriverPlanShare;

const keyring = { activeKeyId: 'k1', keys: { k1: randomBytes(32) } };

const update = (who: SignedIn, payload: Record<string, unknown>) =>
  harness.run(who, 'update_driver_plan_share', { share_id: made.id, ...payload });

beforeAll(async () => {
  harness = await startSetupHarness(registerChangesetCommands, (app, deps) =>
    registerDriverPlanShares({
      app,
      doors: deps,
      keyring,
      appEnv: 'staging',
      webProxySecret: undefined,
    }),
  );
  crew = await buildSetupCrew(harness, 3);
  [organiser, member] = crew.members as [SignedIn, SignedIn];
  await seedCurrentPlan(harness.pool, crew.tripId);
  const created = await harness.run(member, 'create_driver_plan_share', {
    trip_id: crew.tripId,
    driver_name: 'Made',
    day_nos: [1, 2, 3],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  made = resultOf<DriverPlanShare>(created);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('update_driver_plan_share', () => {
  it('lets another member narrow the days and turn quotes off, keeping the link', async () => {
    const changed = await update(organiser, { day_nos: [3, 1, 1, 9], allow_quote: false });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    const share = resultOf<DriverPlanShare>(changed);
    // Day 9 is not in the plan; repeats collapse and the days come back in order.
    expect(share).toMatchObject({ id: made.id, day_nos: [1, 3], allow_quote: false });
    expect(share.url).toBe(made.url);
    expect(share.expires_at).toBe(made.expires_at);
  });

  it('counts a new expiry from now and leaves the days alone', async () => {
    const before = Date.now();
    const changed = await update(member, { expires_in_days: 2 });
    const share = resultOf<DriverPlanShare>(changed);
    expect(share.day_nos).toEqual([1, 3]);
    const expires = new Date(share.expires_at).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 2 * DAY_MS - 5_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 2 * DAY_MS + 5_000);
  });

  it('refuses a change that leaves the driver no day', async () => {
    const empty = await update(member, { day_nos: [8, 9] });
    expect(errorOf(empty)).toMatchObject({ code: 'VALIDATION', detail: { reason: 'no_days' } });
  });

  it('is refused to someone outside the crew, and for a share that does not exist', async () => {
    const outsider = await harness.signIn();
    const refused = await update(outsider, { allow_quote: true });
    expect(errorOf(refused).code).toBe('NOT_FOUND');
    const missing = await harness.run(member, 'update_driver_plan_share', {
      share_id: generateUuidV7(),
      allow_quote: true,
    });
    expect(errorOf(missing)).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'driver_plan_share' },
    });
    const { rows } = await harness.pool.query<{ allow_quote: boolean }>(
      'SELECT allow_quote FROM driver_plan_shares WHERE id = $1',
      [made.id],
    );
    expect(rows).toEqual([{ allow_quote: false }]);
  });

  it('cannot bring a revoked link back', async () => {
    const revoked = await harness.run(member, 'revoke_driver_plan_share', { share_id: made.id });
    expect(revoked.status).toBe(200);
    const changed = await update(organiser, { expires_in_days: 3 });
    expect(errorOf(changed)).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'revoked' } });
  });
});
