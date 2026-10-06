/**
 * A personal version for a trip priced in two currencies: the Kyoto Six pay in USD, but the tea
 * ceremony is priced in EUR. The recipient's skip suggestions convert it with the latest rates
 * instead of failing for want of them. Real database; no model call.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadVersionContext, loadVersionTarget } from '../../src/jobs/proposal/version-context';
import { startProposalWorld, type ProposalWorld } from './proposal-world';

let world: ProposalWorld;

beforeAll(async () => {
  world = await startProposalWorld();
  await world.q(
    `INSERT INTO cost_components (trip_id, calc_version, component_key, kind, unit, is_shared,
                                  amount_minor, currency, source, seen_at, label)
     VALUES ($1, 'cv_test', 'tea', 'activity', 'person', false, 20000, 'EUR', 'user', now(), 'tea')`,
    [world.tripId],
  );
  // An older run and a newer one: the newest rate of the pair is the one used.
  await world.q(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES
       ('EUR', 'USD', '1.0000000000', current_date - 3, 'ecb'),
       ('EUR', 'USD', '1.2000000000', current_date, 'ecb')`,
  );
}, 240_000);

afterAll(async () => {
  await world.stop();
});

describe('a personal version on a mixed-currency trip', () => {
  it('prices the skip suggestions in the trip currency with the latest rates', async () => {
    const [row] = await world.q<{ id: string }>(
      'SELECT id FROM proposal_versions WHERE proposal_id = $1 AND recipient_id = $2',
      [world.proposalId, world.users.Dev],
    );
    const target = await loadVersionTarget(world.harness.pool, row!.id);
    const loaded = await loadVersionContext(world.harness.pool, target!);

    // €200 at 1.20 is $240, the biggest thing Dev could skip.
    expect(loaded.context.savings[0]).toEqual(expect.objectContaining({ id: 'skip:tea' }));
    expect(loaded.context.savings[0]!.amount).toContain('240');
    expect(loaded.savingsMinor).not.toBeNull();
    expect(loaded.savingsMinor! <= -24000n).toBe(true);
  });
});
