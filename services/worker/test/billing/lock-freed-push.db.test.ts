/**
 * "Tell me when it's done": a boost lock that lapses or is let go tells the members who asked
 * (still seated, never the lock's buyer) that the trip is free to boost, into the boost sheet. A
 * purchase, a trip boosted another way since and nobody asking tell nobody.
 */
import { withSystem } from '@cp/db';
import { BILLING_PUSH } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { composeLockFreed, lockFreedAudience } from '../../src/jobs/billing/lock-freed-push';
import type { RoutedEvent } from '../../src/jobs/notify/register';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

interface Locked {
  readonly crewId: string;
  readonly tripId: string;
  readonly intentId: string;
  readonly buyer: string;
  readonly waiting: string;
  readonly out: string;
  readonly quiet: string;
}

async function locked(): Promise<Locked> {
  return withSystem(harness.pool, async (tx) => {
    const uids: string[] = [];
    for (const name of ['Winston Lee', 'Maya Tan', 'Jordan', 'Sam']) {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO users (id, tz, display_name) VALUES (uuidv7(), 'Asia/Singapore', $1) RETURNING id",
        [name],
      );
      uids.push(rows[0]!.id);
    }
    const [buyer, waiting, out, quiet] = uids as [string, string, string, string];
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name) VALUES ('The Kyoto Four') RETURNING id",
    );
    const crewId = crew.rows[0]!.id;
    const trip = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crewId],
    );
    const tripId = trip.rows[0]!.id;
    for (const [index, uid] of uids.entries()) {
      await tx.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
        crewId,
        uid,
        index === 0 ? 'organiser' : 'member',
      ]);
      await tx.query(
        'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
        [tripId, uid, index === 0 ? 'organiser' : 'member', uid === out ? 'out' : 'in'],
      );
    }
    const intent = await tx.query<{ id: string }>(
      `INSERT INTO boost_intents (trip_id, crew_id, buyer_id, product_key, split_mode, status,
         expires_at, waiting_uids)
       VALUES ($1, $2, $3, 'boost_trip', 'cover', 'expired', now(), $4) RETURNING id`,
      [tripId, crewId, buyer, [waiting, out, buyer]],
    );
    return { crewId, tripId, intentId: intent.rows[0]!.id, buyer, waiting, out, quiet };
  });
}

function released(l: Locked, reason: 'expired' | 'released' | 'fulfilled'): RoutedEvent {
  return {
    id: l.intentId,
    type: 'boost.intent_released',
    payload: { trip_id: l.tripId, crew_id: l.crewId, intent_id: l.intentId, reason },
    crewId: l.crewId,
    tripId: l.tripId,
    actorId: null,
    occurredAt: new Date(),
  };
}

describe('the lock-freed push', () => {
  it('tells the seated members who asked, into the boost sheet', async () => {
    const l = await locked();
    await withSystem(harness.pool, async (tx) => {
      expect(await lockFreedAudience(tx, released(l, 'expired'))).toEqual([l.waiting]);
      expect(await lockFreedAudience(tx, released(l, 'released'))).toEqual([l.waiting]);
      expect(await composeLockFreed(tx, released(l, 'expired'))).toMatchObject({
        title: BILLING_PUSH.lockFreedTitle,
        body: BILLING_PUSH.lockFreedBody,
        vars: { place: 'The Kyoto Four', buyer: 'Winston' },
        tripId: l.tripId,
        deepLink: `/boost/${l.tripId}`,
      });
    });
  });

  it('stays quiet after a purchase or once the trip is boosted another way', async () => {
    const l = await locked();
    await withSystem(harness.pool, async (tx) => {
      expect(await lockFreedAudience(tx, released(l, 'fulfilled'))).toEqual([]);
      await tx.query(
        `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, starts_at, ends_at, status)
         VALUES ($1, $2, $3, 'promo', now(), now() + interval '30 days', 'active')`,
        [l.tripId, l.crewId, l.quiet],
      );
      expect(await composeLockFreed(tx, released(l, 'expired'))).toBeNull();
    });
  });
});
