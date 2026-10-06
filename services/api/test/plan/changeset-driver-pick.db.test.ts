/**
 * A crew picks a driver through a change set, on the real stack: a member drafts the pick with the
 * quoted terms, the draft is checked like the direct pick (a driver of this trip, each day once, no
 * day already set on another driver), the crew's majority applies it, and the driver is then set on
 * his days with the terms voted on and the change set that decided it. The plan's items are carried
 * over untouched, and a pick never becomes one member's personal change.
 */
import { generateUuidV7, type ChangesetOutcome } from '@cp/domain';
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
import { seedCurrentPlan, type SeededPlan } from './plan-fixture';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;
let m1: SignedIn;
let m2: SignedIn;
let m3: SignedIn;
let made: string;
let komang: string;

const TERMS = {
  price_minor: 70_000_000,
  currency: 'IDR',
  price_unit: 'day',
  included_hours: 10,
  includes: { fuel: 'yes', tolls: 'no' },
  overtime_minor: 5_000_000,
};

const dayOf = (date: string) => ({
  date,
  window_start: '06:30',
  window_end: '18:00',
  pickup: 'Villa gate',
});

const pick = (providerId: string, dates: readonly string[], terms?: typeof TERMS) => ({
  op: 'assign_provider',
  target: providerId,
  assignment: { days: dates.map(dayOf), ...(terms === undefined ? {} : { terms }) },
  reason: 'our driver for these days',
  affected_user_ids: [],
  booking_impact: false,
});

const current = async (): Promise<string> =>
  (
    await harness.pool.query<{ v: string }>(
      'SELECT current_version_id AS v FROM trips WHERE id = $1',
      [crew.tripId],
    )
  ).rows[0]?.v as string;

const draft = async (who: SignedIn, ops: readonly unknown[]) =>
  harness.run(who, 'create_changeset', {
    trip_id: crew.tripId,
    base_version: await current(),
    ops,
  });

async function driver(tripId: string, name: string): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    "INSERT INTO providers (trip_id, kind, name) VALUES ($1, 'driver', $2) RETURNING id",
    [tripId, name],
  );
  return rows[0]?.id as string;
}

const itemCount = async (versionId: string): Promise<number> =>
  (
    await harness.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM plan_items WHERE version_id = $1',
      [versionId],
    )
  ).rows[0]?.n ?? 0;

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 4);
  [, m1, m2, m3] = crew.members as [SignedIn, SignedIn, SignedIn, SignedIn];
  for (const member of [m1, m2, m3]) {
    await harness.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [crew.tripId, member.uid],
    );
  }
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
  made = await driver(crew.tripId, 'Made');
  komang = await driver(crew.tripId, 'Komang');
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('a driver picked through a change set', () => {
  it('refuses a pick that could not be set as it stands', async () => {
    const [first, second] = plan.dates as [string, string, string];
    const unknown = await draft(m1, [pick(generateUuidV7(), [first])]);
    expect(errorOf(unknown)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'provider' } });
    const twoDrivers = await draft(m1, [pick(made, [first]), pick(komang, [first, second])]);
    expect(errorOf(twoDrivers)).toMatchObject({ code: 'VALIDATION', detail: { reason: 'days' } });
    const withItemFields = await draft(m1, [{ ...pick(made, [first]), after: { day_no: 1 } }]);
    expect(errorOf(withItemFields).code).toBe('VALIDATION');
  });

  it('sets the driver on his days with the voted terms once the majority says yes', async () => {
    const [first, second] = plan.dates as [string, string, string];
    const before = await current();
    const drafted = await draft(m1, [pick(made, [first, second], TERMS)]);
    expect(drafted.status).toBe(200);
    const id = resultOf<{ change_set_id: string }>(drafted).change_set_id;

    const personal = await harness.run(m1, 'apply_changeset', {
      changeset_id: id,
      scope: 'personal',
    });
    expect(errorOf(personal)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'nothing_accepted' },
    });

    const sent = resultOf<ChangesetOutcome>(
      await harness.run(m1, 'send_changeset', { changeset_id: id }),
    );
    // A driver is everyone's: the whole crew votes, and sending is the author's yes.
    expect(sent).toMatchObject({ status: 'voting', needed: 3, eligible: 4, yes: 1 });
    const unset = await harness.pool.query(
      'SELECT 1 FROM provider_assignments WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(unset.rows).toHaveLength(0);

    await harness.run(m2, 'approve_changeset', { changeset_id: id, decision: 'yes' });
    const applied = resultOf<ChangesetOutcome>(
      await harness.run(m3, 'approve_changeset', { changeset_id: id, decision: 'yes' }),
    );
    expect(applied.status).toBe('applied');
    expect(await current()).toBe(applied.result_version_id);
    expect(await itemCount(applied.result_version_id as string)).toBe(await itemCount(before));

    const { rows } = await harness.pool.query(
      `SELECT to_char(day_date, 'YYYY-MM-DD') AS date, provider_id, window_start, window_end,
              pickup, agreed, change_set_id, assigned_by
         FROM provider_assignments WHERE trip_id = $1 ORDER BY day_date`,
      [crew.tripId],
    );
    const row = {
      provider_id: made,
      window_start: '06:30',
      window_end: '18:00',
      pickup: 'Villa gate',
      agreed: TERMS,
      change_set_id: id,
      assigned_by: m1.uid,
    };
    expect(rows).toEqual([
      { date: first, ...row },
      { date: second, ...row },
    ]);
  });

  it('refuses a draft for a day already set on another driver', async () => {
    const [first, , third] = plan.dates as [string, string, string];
    const taken = await draft(m2, [pick(komang, [first, third])]);
    expect(errorOf(taken)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'day_taken', dates: [first] },
    });
    // His own days may be voted on again (new terms, a new window).
    expect((await draft(m2, [pick(made, [first])])).status).toBe(200);
  });
});
