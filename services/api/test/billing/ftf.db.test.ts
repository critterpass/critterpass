/**
 * First trip free. A crew's first trip entering setup with two or more seated members gets Boost,
 * and everyone on it Pass+, until its end + 7 days. Never twice for a crew, and never a second time
 * through the same organiser account, verified phone or attested device, whatever the crew.
 * Entering setup queues the check in the same transaction as the status change.
 */
import { createHash } from 'node:crypto';

import { appendDomainEvent, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { grantFirstTripFree } from '../../src/billing/ftf-eligibility';
import { crewWithTrip, startBillingHarness, stateOf, type BillingHarness } from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const grant = (tripId: string) =>
  withSystem(harness.pool, (tx) => grantFirstTripFree(tx, tripId, new Date()));

async function users(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) ids.push((await harness.signIn()).uid);
  return ids;
}

describe('first trip free', () => {
  it('grants the first crew trip once, with Boost for the trip and Pass+ for its members', async () => {
    const [organiser, member] = await users(2);
    const crew = await crewWithTrip(harness.pool, organiser!, [member!]);
    const outcome = await grant(crew.tripId);
    expect(outcome).toMatchObject({ granted: true, review: false });
    const { rows } = await harness.pool.query(
      'SELECT boost_active, seat_cap FROM trip_entitlements WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(rows[0]).toEqual({ boost_active: true, seat_cap: 16 });
    expect((await stateOf(harness.pool, member!)).passPlus).toBe(true);
    expect(await grant(crew.tripId)).toEqual({ granted: false, reason: 'crew_already_had_one' });

    // The same organiser's next crew gets nothing.
    const [other] = await users(1);
    const second = await crewWithTrip(harness.pool, organiser!, [other!]);
    expect(await grant(second.tripId)).toEqual({
      granted: false,
      reason: 'organiser_already_had_one',
    });
  });

  it('refuses a second first trip free through the same verified phone', async () => {
    const [a, b, c, d] = await users(4);
    const phone = createHash('sha256').update('+6590001234').digest('hex');
    const setPhone = (uid: string) =>
      withSystem(harness.pool, (tx) =>
        tx.query('INSERT INTO user_private (user_id, phone_hash) VALUES ($1, $2)', [uid, phone]),
      );
    await setPhone(a!);
    expect(await grant((await crewWithTrip(harness.pool, a!, [b!])).tripId)).toMatchObject({
      granted: true,
    });
    // The number moves to another account (the first gave it up): still the same phone.
    await withSystem(harness.pool, (tx) =>
      tx.query('UPDATE user_private SET phone_hash = NULL WHERE user_id = $1', [a]),
    );
    await setPhone(c!);
    expect(await grant((await crewWithTrip(harness.pool, c!, [d!])).tripId)).toEqual({
      granted: false,
      reason: 'organiser_already_had_one',
    });
  });

  it('needs two seated members and a crew trip', async () => {
    const [solo] = await users(1);
    const crew = await crewWithTrip(harness.pool, solo!, []);
    expect(await grant(crew.tripId)).toEqual({ granted: false, reason: 'too_few_seated' });
  });

  it('queues the check when a trip enters setup', async () => {
    const [organiser, member] = await users(2);
    const crew = await crewWithTrip(harness.pool, organiser!, [member!]);
    await harness.pool.query("UPDATE trips SET status = 'won' WHERE id = $1", [crew.tripId]);
    await harness.pool.query("UPDATE trips SET status = 'setup' WHERE id = $1", [crew.tripId]);
    await withSystem(harness.pool, (tx) =>
      appendDomainEvent(tx, {
        type: 'trip.status_changed',
        aggregateKind: 'trip',
        aggregateId: crew.tripId,
        actorKind: 'system',
        actorId: null,
        crewId: crew.crewId,
        tripId: crew.tripId,
        payload: { trip_id: crew.tripId, from: 'won', to: 'setup' },
      }),
    );
    const { rows } = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'ftf.grant' AND data->>'trip_id' = $1",
      [crew.tripId],
    );
    expect(rows).toHaveLength(1);
  });
});
