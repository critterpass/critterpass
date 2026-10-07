/**
 * The crew's boost card. Only the buyer posts it, once per boost however often they ask, and only
 * while the boost is on; a crewmate thanks the buyer once, and the buyer cannot thank themselves.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildMoneyCrew, type MoneyCrew } from '../money/money-harness';
import { errorOf, resultOf } from '../setup/setup-harness';
import { startBillingHarness, type BillingHarness } from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function boosted(crew: MoneyCrew, status = 'active'): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, starts_at, ends_at, status)
       VALUES ($1, $2, $3, 'promo', now(), now() + interval '30 days', $4) RETURNING id`,
      [crew.tripId, crew.crewId, crew.members[1]!.uid, status],
    );
    return rows[0]!.id;
  });
}

async function cards(boostId: string) {
  const { rows } = await harness.pool.query<{
    id: string;
    sender_id: string;
    trip_id: string;
    crew_id: string;
  }>(
    `SELECT id, sender_id, trip_id, crew_id FROM messages
      WHERE type = 'boost_card' AND ref_kind = 'trip_boost' AND ref_id = $1`,
    [boostId],
  );
  return rows;
}

describe('tell_crew_boost', () => {
  it('posts one card from the buyer, and the same one when asked again', async () => {
    const crew = await buildMoneyCrew(harness, 3);
    const buyer = crew.members[1]!;
    const boostId = await boosted(crew);

    const first = await harness.run(buyer, 'tell_crew_boost', { boost_id: boostId });
    const told = resultOf<{ message_id: string; posted: boolean }>(first);
    expect(told.posted).toBe(true);
    expect(await cards(boostId)).toEqual([
      { id: told.message_id, sender_id: buyer.uid, trip_id: crew.tripId, crew_id: crew.crewId },
    ]);

    const again = await harness.run(buyer, 'tell_crew_boost', { boost_id: boostId });
    expect(resultOf(again)).toEqual({ message_id: told.message_id, posted: false });
    expect(await cards(boostId)).toHaveLength(1);
  });

  it('refuses a crewmate who did not buy it, and anyone outside the crew', async () => {
    const crew = await buildMoneyCrew(harness, 3);
    const boostId = await boosted(crew);
    const crewmate = await harness.run(crew.members[2]!, 'tell_crew_boost', { boost_id: boostId });
    expect(errorOf(crewmate)).toMatchObject({ code: 'FORBIDDEN', detail: { reason: 'not_buyer' } });
    const outsider = await harness.run(await harness.signIn(), 'tell_crew_boost', {
      boost_id: boostId,
    });
    expect(errorOf(outsider).code).toMatch(/NOT_FOUND|FORBIDDEN/);
    expect(await cards(boostId)).toEqual([]);
  });

  it('posts nothing for a boost that has ended', async () => {
    const crew = await buildMoneyCrew(harness, 2);
    const boostId = await boosted(crew, 'ended');
    const response = await harness.run(crew.members[1]!, 'tell_crew_boost', { boost_id: boostId });
    expect(errorOf(response)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'boost_not_live' },
    });
    expect(await cards(boostId)).toEqual([]);
  });
});

describe('thank_boost', () => {
  it('records a crewmate’s thanks once and never the buyer’s own', async () => {
    const crew = await buildMoneyCrew(harness, 3);
    const boostId = await boosted(crew);
    const crewmate = crew.members[2]!;

    const thanked = await harness.run(crewmate, 'thank_boost', { boost_id: boostId });
    expect(resultOf(thanked)).toEqual({ boost_id: boostId, thanked: true });
    const twice = await harness.run(crewmate, 'thank_boost', { boost_id: boostId });
    expect(errorOf(twice)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'already_thanked' },
    });
    const own = await harness.run(crew.members[1]!, 'thank_boost', { boost_id: boostId });
    expect(errorOf(own).code).toBe('FORBIDDEN');

    const { rows } = await harness.pool.query<{ thanked_by: string[] }>(
      'SELECT thanked_by FROM trip_boosts WHERE id = $1',
      [boostId],
    );
    expect(rows[0]!.thanked_by).toEqual([crewmate.uid]);
  });
});
