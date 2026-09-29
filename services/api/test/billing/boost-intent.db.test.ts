/**
 * The trip's boost lock. Two members racing for it: exactly one gets it, the other is told who
 * holds it and until when. Only seated members may take it; the holder can take it again or let it
 * go; a lock past its 15 minutes lapses; and a trip already boosted takes no new lock.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireIntent } from '../../src/commands/boost/release-boost-intent';
import { buildMoneyCrew, type MoneyCrew } from '../money/money-harness';
import { errorOf, resultOf } from '../setup/setup-harness';
import { startBillingHarness, type BillingHarness } from './billing-harness';

let harness: BillingHarness;
let crew: MoneyCrew;

beforeAll(async () => {
  harness = await startBillingHarness();
  crew = await buildMoneyCrew(harness, 4);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const intent = (tripId: string, extra: Record<string, unknown> = {}) => ({
  intent_id: generateUuidV7(),
  trip_id: tripId,
  product_key: 'boost_trip',
  split_mode: 'cover',
  ...extra,
});

async function openLocks(tripId: string): Promise<number> {
  const { rows } = await harness.pool.query(
    "SELECT 1 FROM boost_intents WHERE trip_id = $1 AND status IN ('open', 'purchasing')",
    [tripId],
  );
  return rows.length;
}

describe('create_boost_intent', () => {
  it('gives the lock to exactly one of two members racing for it', async () => {
    const [a, b] = [crew.members[1]!, crew.members[2]!];
    const results = await Promise.all([
      harness.run(a, 'create_boost_intent', intent(crew.tripId)),
      harness.run(b, 'create_boost_intent', intent(crew.tripId)),
    ]);
    const won = results.filter((result) => result.status === 200);
    const lost = results.filter((result) => result.status !== 200);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const holder = resultOf<{ app_account_token: string }>(won[0]!).app_account_token;
    expect(errorOf(lost[0]!)).toMatchObject({
      code: 'BOOST_INTENT_LOCKED',
      detail: { by_uid: holder },
    });
    expect(await openLocks(crew.tripId)).toBe(1);

    // The holder opening the sheet again replaces their own lock.
    const holderSession = holder === a.uid ? a : b;
    const again = await harness.run(holderSession, 'create_boost_intent', intent(crew.tripId));
    expect(again.status).toBe(200);
    expect(await openLocks(crew.tripId)).toBe(1);

    // Letting it go frees the trip for the other member.
    const released = await harness.run(holderSession, 'release_boost_intent', {
      intent_id: resultOf<{ intent_id: string }>(again).intent_id,
    });
    expect(released.body).toMatchObject({ result: { status: 'cancelled' } });
    const other = holderSession === a ? b : a;
    const taken = await harness.run(other, 'create_boost_intent', intent(crew.tripId));
    expect(taken.status).toBe(200);

    // Past its 15 minutes it lapses, and the lock is free again.
    const id = resultOf<{ intent_id: string }>(taken).intent_id;
    const early = await withSystem(harness.pool, (tx) => expireIntent(tx, id, new Date()));
    expect(early.status).toBe('open');
    const later = new Date(Date.now() + 16 * 60_000);
    expect((await withSystem(harness.pool, (tx) => expireIntent(tx, id, later))).status).toBe(
      'expired',
    );
    expect(await openLocks(crew.tripId)).toBe(0);
  });

  it('refuses anyone not seated on the trip and a split that leaves out the buyer', async () => {
    const outsider = await harness.signIn();
    const refused = await harness.run(outsider, 'create_boost_intent', intent(crew.tripId));
    expect(errorOf(refused).code).toMatch(/NOT_ELIGIBLE|NOT_FOUND/);
    const noBuyer = await harness.run(
      crew.members[1]!,
      'create_boost_intent',
      intent(crew.tripId, {
        split_mode: 'split',
        member_uids: [crew.members[2]!.uid, crew.members[3]!.uid],
      }),
    );
    expect(errorOf(noBuyer).code).toBe('VALIDATION');
  });

  it('takes no lock on a trip that is already boosted', async () => {
    const other = await buildMoneyCrew(harness, 2);
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO trip_boosts (trip_id, crew_id, source, starts_at, ends_at)
         VALUES ($1, $2, 'promo', now(), now() + interval '30 days')`,
        [other.tripId, other.crewId],
      ),
    );
    const response = await harness.run(
      other.organiser,
      'create_boost_intent',
      intent(other.tripId),
    );
    expect(errorOf(response)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'already_boosted' },
    });
  });
});
