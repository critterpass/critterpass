/**
 * The change set lifecycle on the real stack: a member drafts and sends a change to the crew, the
 * affected members vote from any surface through `approve_changeset` (a repeated yes counts once),
 * the majority applies it as a new plan version; a change set drafted on the same item before that
 * goes stale and can never apply; a supplier hold pulls the vote's deadline in; and enough noes
 * keep the plan. Only the author sends or toggles; nobody outside the crew sees a change set.
 */
import { NO_HOLDS, registerHoldExpiryProvider, type ChangesetOutcome } from '@cp/domain';
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
let org: SignedIn;
let m1: SignedIn;
let m2: SignedIn;
let m3: SignedIn;

const current = async (): Promise<string> =>
  (
    await harness.pool.query<{ v: string }>(
      'SELECT current_version_id AS v FROM trips WHERE id = $1',
      [crew.tripId],
    )
  ).rows[0]?.v as string;

async function draft(who: SignedIn, target: string, hour: number, day = 0): Promise<string> {
  const date = plan.dates[day] as string;
  const response = await harness.run(who, 'create_changeset', {
    trip_id: crew.tripId,
    base_version: await current(),
    ops: [
      {
        op: 'retime',
        target,
        after: { starts_at: tokyo(date, hour), ends_at: tokyo(date, hour + 1) },
        reason: 'later start',
        affected_user_ids: [],
        booking_impact: false,
      },
    ],
  });
  expect(response.status).toBe(200);
  return resultOf<{ change_set_id: string }>(response).change_set_id;
}

const send = (who: SignedIn, id: string) =>
  harness.run(who, 'send_changeset', { changeset_id: id });
const vote = (who: SignedIn, id: string, decision: 'yes' | 'no') =>
  harness.run(who, 'approve_changeset', { changeset_id: id, decision });

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 4);
  [org, m1, m2, m3] = crew.members as [SignedIn, SignedIn, SignedIn, SignedIn];
  for (const member of [m1, m2, m3]) {
    await harness.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [crew.tripId, member.uid],
    );
  }
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  registerHoldExpiryProvider(NO_HOLDS);
  await harness?.stop();
});

describe('change set lifecycle', () => {
  it('sends, votes by majority, applies once, and leaves a clashing draft stale', async () => {
    const outsider = await harness.signIn();
    expect(
      errorOf(
        await harness.run(outsider, 'create_changeset', {
          trip_id: crew.tripId,
          base_version: plan.versionId,
          ops: [
            {
              op: 'remove',
              target: plan.walk,
              reason: 'x',
              affected_user_ids: [],
              booking_impact: false,
            },
          ],
        }),
      ).code,
    ).toBe('NOT_FOUND');

    const first = await draft(m1, plan.walk, 14);
    const clash = await draft(m2, plan.walk, 16);
    // An unsent draft is its author's alone: another member cannot even find it.
    expect(errorOf(await send(m2, first)).code).toBe('NOT_FOUND');
    expect(
      errorOf(
        await harness.run(m2, 'set_changeset_item', {
          changeset_id: first,
          change_id: plan.walk,
          accepted: false,
        }),
      ).code,
    ).toBe('NOT_FOUND');

    const sent = resultOf<ChangesetOutcome>(await send(m1, first));
    expect(sent).toMatchObject({ status: 'voting', needed: 3, eligible: 4, yes: 0 });
    const { rows: armed } = await harness.pool.query(
      `SELECT 1 FROM scheduled_events WHERE kind = 'plan.changeset_expiry' AND ref_id = $1
       UNION ALL SELECT 1 FROM messages WHERE type = 'changeset' AND ref_id = $1`,
      [first],
    );
    expect(armed).toHaveLength(2);

    expect(resultOf<ChangesetOutcome>(await vote(m2, first, 'yes')).yes).toBe(1);
    expect(resultOf<ChangesetOutcome>(await vote(m2, first, 'yes')).yes).toBe(1);
    expect(resultOf<ChangesetOutcome>(await vote(m3, first, 'yes')).status).toBe('voting');
    const applied = resultOf<ChangesetOutcome>(await vote(org, first, 'yes'));
    expect(applied).toMatchObject({ status: 'applied', yes: 3 });
    expect(await current()).toBe(applied.result_version_id);
    expect(errorOf(await vote(m1, first, 'no')).code).toBe('VOTE_CLOSED');

    expect(resultOf<ChangesetOutcome>(await send(m2, clash)).status).toBe('stale');
    expect(
      errorOf(await harness.run(org, 'apply_changeset', { changeset_id: clash, scope: 'group' })),
    ).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'stale' } });
  });

  it('closes the vote by the earliest hold, and keeps the plan when the noes win', async () => {
    const hold = new Date(Date.now() + 2 * 3_600_000);
    registerHoldExpiryProvider({ earliestHoldExpiry: () => Promise.resolve(hold) });
    const id = await draft(m1, plan.museum, 15, 1);
    const sent = resultOf<ChangesetOutcome>(await send(m1, id));
    const { rows } = await harness.pool.query<{ closes_at: Date }>(
      'SELECT closes_at FROM polls WHERE id = $1',
      [sent.poll_id],
    );
    expect(rows[0]?.closes_at.getTime()).toBeLessThanOrEqual(hold.getTime());
    registerHoldExpiryProvider(NO_HOLDS);

    const before = await current();
    await vote(m2, id, 'no');
    // Two noes of four can still end in a tie; the third settles it.
    expect(resultOf<ChangesetOutcome>(await vote(m3, id, 'no')).status).toBe('voting');
    const kept = resultOf<ChangesetOutcome>(await vote(org, id, 'no'));
    expect(kept.status).toBe('rejected');
    expect(await current()).toBe(before);
  });
});
