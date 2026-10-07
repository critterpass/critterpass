/**
 * The boost push. A member's purchase tells everyone else seated on the trip, from that crewmate
 * and into the crew chat; the buyer, anyone who is out, a boost nobody bought and a boost that is
 * no longer on tell nobody.
 */
import { withSystem } from '@cp/db';
import { BILLING_PUSH } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { boostPushAudience, composeBoostPush } from '../../src/jobs/billing/boost-push';
import type { RoutedEvent } from '../../src/jobs/notify/register';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

interface Boosted {
  readonly crewId: string;
  readonly tripId: string;
  readonly boostId: string;
  readonly buyer: string;
  readonly seated: string;
  readonly out: string;
}

async function boosted(status: 'active' | 'ended' = 'active'): Promise<Boosted> {
  return withSystem(harness.pool, async (tx) => {
    const uids: string[] = [];
    for (const name of ['Winston Lee', 'Maya', 'Jordan']) {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO users (id, tz, display_name) VALUES (uuidv7(), 'Asia/Singapore', $1) RETURNING id",
        [name],
      );
      uids.push(rows[0]!.id);
    }
    const [buyer, seated, out] = uids as [string, string, string];
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name) VALUES ('The Bali Six') RETURNING id",
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
    const boost = await tx.query<{ id: string }>(
      `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, starts_at, ends_at, status)
       VALUES ($1, $2, $3, 'promo', now(), now() + interval '30 days', $4) RETURNING id`,
      [tripId, crewId, buyer, status],
    );
    return { crewId, tripId, boostId: boost.rows[0]!.id, buyer, seated, out };
  });
}

function activated(b: Boosted, source = 'purchase', buyer: string | null = b.buyer): RoutedEvent {
  return {
    id: b.boostId,
    type: 'boost.activated',
    payload: {
      trip_id: b.tripId,
      crew_id: b.crewId,
      boost_id: b.boostId,
      buyer_id: buyer,
      source,
      split: false,
    },
    crewId: b.crewId,
    tripId: b.tripId,
    actorId: buyer,
    occurredAt: new Date(),
  };
}

describe('the boost push', () => {
  it('goes to the seated crewmates, from the buyer, into the crew chat', async () => {
    const b = await boosted();
    const event = activated(b);
    await withSystem(harness.pool, async (tx) => {
      expect(await boostPushAudience(tx, event)).toEqual([b.seated]);
      expect(await composeBoostPush(tx, event)).toMatchObject({
        title: BILLING_PUSH.boostTitle,
        body: BILLING_PUSH.boostBody,
        vars: { buyer: 'Winston', place: 'The Bali Six' },
        sender: { kind: 'member', id: b.buyer, name: 'Winston' },
        crewId: b.crewId,
        tripId: b.tripId,
        deepLink: `/crew/${b.crewId}/chat`,
      });
    });
  });

  it('tells nobody about a boost that nobody bought', async () => {
    const b = await boosted();
    await withSystem(harness.pool, async (tx) => {
      expect(await boostPushAudience(tx, activated(b, 'first_trip_free', null))).toEqual([]);
      expect(await boostPushAudience(tx, activated(b, 'moved'))).toEqual([]);
      expect(await composeBoostPush(tx, activated(b, 'first_trip_free', null))).toBeNull();
    });
  });

  it('says nothing once the boost is no longer on', async () => {
    const b = await boosted('ended');
    await withSystem(harness.pool, async (tx) => {
      expect(await composeBoostPush(tx, activated(b))).toBeNull();
    });
  });
});
