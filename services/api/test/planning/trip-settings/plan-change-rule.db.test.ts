/**
 * The trip's plan-change rule on the real stack: only an organiser sets it; under the default a
 * member's direct edit is refused and their change set goes to the crew; under `anyone` the same
 * edit lands as a new version; under `organiser_only` a member can neither edit nor send a change
 * set, while the organiser still edits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPlanCommands } from '../../../src/commands/plan';
import { setPlanChangeRuleCommand } from '../../../src/planning/trip-settings/set-plan-change-rule';
import { seedCurrentPlan, tokyo, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;
let org: SignedIn;
let member: SignedIn;

const current = async (): Promise<string> =>
  (
    await harness.pool.query<{ v: string }>(
      'SELECT current_version_id AS v FROM trips WHERE id = $1',
      [crew.tripId],
    )
  ).rows[0]?.v as string;

const setRule = (who: SignedIn, rule: string) =>
  harness.run(who, 'set_plan_change_rule', { trip_id: crew.tripId, rule });

const moveWalk = async (who: SignedIn, hour: number) =>
  harness.run(who, 'apply_plan_ops', {
    trip_id: crew.tripId,
    base_version: await current(),
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
  });

async function proposeWalk(who: SignedIn, hour: number) {
  const date = plan.dates[0] as string;
  const created = await harness.run(who, 'create_changeset', {
    trip_id: crew.tripId,
    base_version: await current(),
    ops: [
      {
        op: 'retime',
        target: plan.walk,
        after: { starts_at: tokyo(date, hour), ends_at: tokyo(date, hour + 1) },
        reason: 'later start',
        affected_user_ids: [],
        booking_impact: false,
      },
    ],
  });
  expect(created.status).toBe(200);
  const id = resultOf<{ change_set_id: string }>(created).change_set_id;
  return harness.run(who, 'send_changeset', { changeset_id: id });
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registerPlanCommands(registry);
    registry.register(setPlanChangeRuleCommand);
  });
  crew = await buildSetupCrew(harness, 3);
  [org, member] = crew.members as [SignedIn, SignedIn];
  await harness.pool.query(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
    [crew.tripId, member.uid],
  );
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('the plan-change rule', () => {
  it('is set by an organiser only, and answers whether it changed', async () => {
    expect(errorOf(await setRule(member, 'anyone'))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'organiser_only' },
    });
    expect(resultOf(await setRule(org, 'organiser_approves'))).toEqual({
      trip_id: crew.tripId,
      rule: 'organiser_approves',
      changed: false,
    });
  });

  it('sends a member to a change set by default, and the change set reaches the crew', async () => {
    expect(errorOf(await moveWalk(member, 11))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'use_changeset' },
    });
    const sent = await proposeWalk(member, 12);
    expect(sent.status).toBe(200);
  });

  it('lets a member edit directly under anyone', async () => {
    expect(resultOf(await setRule(org, 'anyone'))).toMatchObject({ changed: true });
    const before = await current();
    const applied = await moveWalk(member, 13);
    expect(applied.status).toBe(200);
    const versionId = resultOf<{ version_id: string }>(applied).version_id;
    expect(versionId).not.toBe(before);
    expect(await current()).toBe(versionId);
  });

  it('keeps the crew plan to organisers under organiser_only', async () => {
    expect(resultOf(await setRule(org, 'organiser_only'))).toMatchObject({ changed: true });
    expect(errorOf(await moveWalk(member, 14))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'use_changeset' },
    });
    expect(errorOf(await proposeWalk(member, 15))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'organiser_only' },
    });
    expect((await moveWalk(org, 16)).status).toBe(200);
  });

  it('refuses an unknown rule', async () => {
    expect(errorOf(await setRule(org, 'everyone'))).toMatchObject({ code: 'VALIDATION' });
  });
});
