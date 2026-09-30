/**
 * "Apply to my plan only" on the real stack: the member's accepted changes land in their own
 * personal ops (nobody else, organisers included, reads them), the crew's plan changes only by the
 * member dropping off the item they skip (and the trip is re-priced), a peer's plan is otherwise
 * untouched, and a clash can be dropped. Someone outside the crew cannot apply anything.
 */
import { type ChangesetOutcome } from '@cp/domain';
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
let me: SignedIn;
let peer: SignedIn;

const asUser = async <T extends object>(who: SignedIn, sql: string, params: unknown[]) => {
  const client = await harness.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.uid', $1, true)", [who.uid]);
    await client.query('SET LOCAL ROLE app_user');
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
};

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 3);
  [org, me, peer] = crew.members as [SignedIn, SignedIn, SignedIn];
  for (const member of [me, peer]) {
    await harness.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [crew.tripId, member.uid],
    );
  }
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('personal overlay apply', () => {
  it('keeps my changes mine and only drops me from the item I skip', async () => {
    const created = await harness.run(me, 'create_changeset', {
      trip_id: crew.tripId,
      base_version: plan.versionId,
      ops: [
        {
          op: 'remove',
          target: plan.walk,
          reason: 'sleeping in',
          affected_user_ids: [me.uid],
          booking_impact: false,
        },
        {
          op: 'retime',
          target: plan.museum,
          after: {
            starts_at: tokyo(plan.dates[1] as string, 14),
            ends_at: tokyo(plan.dates[1] as string, 16),
          },
          reason: 'later for me',
          affected_user_ids: [me.uid],
          booking_impact: false,
        },
      ],
    });
    const { change_set_id: id } = resultOf<{ change_set_id: string }>(created);
    const outsider = await harness.signIn();
    expect(
      errorOf(
        await harness.run(outsider, 'apply_changeset', { changeset_id: id, scope: 'personal' }),
      ).code,
    ).toBe('NOT_FOUND');

    const applied = resultOf<ChangesetOutcome & { personal_ops_id: string; version_id: string }>(
      await harness.run(me, 'apply_changeset', { changeset_id: id, scope: 'personal' }),
    );
    expect(applied.status).toBe('applied');
    expect(applied.version_id).not.toBeNull();

    const mine = await asUser<{ n: number }>(
      me,
      'SELECT count(*)::int AS n FROM personal_plan_ops',
      [],
    );
    expect(mine[0]?.n).toBe(1);
    for (const other of [org, peer]) {
      const seen = await asUser<{ n: number }>(
        other,
        'SELECT count(*)::int AS n FROM personal_plan_ops',
        [],
      );
      expect(seen[0]?.n).toBe(0);
    }

    const { rows } = await harness.pool.query<{
      stable_id: string;
      attendee_ids: string[] | null;
      starts_at: Date;
    }>(
      `SELECT i.stable_id, i.attendee_ids, i.starts_at FROM plan_items i
         JOIN trips t ON t.current_version_id = i.version_id WHERE t.id = $1`,
      [crew.tripId],
    );
    const walk = rows.find((r) => r.stable_id === plan.walk);
    const museum = rows.find((r) => r.stable_id === plan.museum);
    expect(walk?.attendee_ids?.sort()).toEqual([org.uid, peer.uid].sort());
    expect(museum?.starts_at.toISOString()).toBe(tokyo(plan.dates[1] as string, 10));
    const jobs = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'cost.recompute' AND data->>'trip_id' = $1",
      [crew.tripId],
    );
    expect(jobs.rowCount).toBeGreaterThan(0);

    const dropped = await harness.run(me, 'resolve_overlay_clash', {
      personal_ops_id: applied.personal_ops_id,
      keep: false,
    });
    expect(resultOf<{ status: string }>(dropped).status).toBe('dropped');
    expect(
      errorOf(
        await harness.run(peer, 'resolve_overlay_clash', {
          personal_ops_id: applied.personal_ops_id,
          keep: true,
        }),
      ).code,
    ).toBe('NOT_FOUND');
  });
});
