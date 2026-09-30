/**
 * Comments on the real stack: a member comments on a plan item, a crewmate +1s it once (and can
 * take it back), the author edits and deletes it (a tombstone stays); nobody else edits it, nobody
 * outside the crew comments, and a comment needs an anchor that exists on the trip.
 */
import { randomUUID } from 'node:crypto';

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

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 3);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('comment commands', () => {
  it('comments, +1s, edits and deletes, each only by who may', async () => {
    const [org, rin, maya] = crew.members as [SignedIn, SignedIn, SignedIn];
    const outsider = await harness.signIn();
    const add = (who: SignedIn, target: { kind: string; id: string }) =>
      harness.run(who, 'add_comment', { trip_id: crew.tripId, target, body: 'Too far on foot?' });

    expect(errorOf(await add(outsider, { kind: 'item', id: plan.walk })).code).toBe('NOT_FOUND');
    expect(errorOf(await add(maya, { kind: 'item', id: randomUUID() }))).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'anchor' },
    });
    expect((await add(maya, { kind: 'day', id: '2' })).status).toBe(200);
    const { comment_id: id } = resultOf<{ comment_id: string }>(
      await add(maya, { kind: 'item', id: plan.walk }),
    );

    const plusOne = (who: SignedIn, cmd = 'plusone_comment') =>
      harness.run(who, cmd, { comment_id: id });
    expect(errorOf(await plusOne(maya))).toMatchObject({ detail: { reason: 'own_comment' } });
    await plusOne(rin);
    await plusOne(rin);
    await plusOne(org);
    const count = async () =>
      (
        await harness.pool.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM comment_plus_ones WHERE comment_id = $1',
          [id],
        )
      ).rows[0]?.n;
    expect(await count()).toBe(2);
    await plusOne(org, 'unplusone_comment');
    expect(await count()).toBe(1);

    expect(
      errorOf(await harness.run(rin, 'edit_comment', { comment_id: id, body: 'Mine now' })).code,
    ).toBe('FORBIDDEN');
    expect(
      (await harness.run(maya, 'edit_comment', { comment_id: id, body: 'Too far, 40 min walk?' }))
        .status,
    ).toBe(200);
    expect(errorOf(await harness.run(org, 'delete_comment', { comment_id: id })).code).toBe(
      'FORBIDDEN',
    );
    expect((await harness.run(maya, 'delete_comment', { comment_id: id })).status).toBe(200);
    const { rows } = await harness.pool.query<{ body: string; deleted: boolean }>(
      'SELECT body, deleted_at IS NOT NULL AS deleted FROM comments WHERE id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ body: '', deleted: true });
    const hints = await harness.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'comment.changed'",
      [`trip_plan:${crew.tripId}`],
    );
    expect(hints.rows[0]?.n).toBeGreaterThanOrEqual(5);
  });
});
