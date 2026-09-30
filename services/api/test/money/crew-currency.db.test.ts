/**
 * The crew's settlement currency defaults to its members' most common home currency. A crew
 * started by someone with a home settles in theirs; a crew started before anyone had one settles
 * the first time its money needs a currency, and keeps it when members join or move afterwards.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resultOf, type SignedIn } from '../setup/setup-harness';
import { buildMoneyCrew, startMoneyHarness, type MoneyHarness } from './money-harness';

let harness: MoneyHarness;

beforeAll(async () => {
  harness = await startMoneyHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function setHome(member: SignedIn, currency: string): Promise<void> {
  await withSystem(harness.pool, (tx) =>
    tx.query('UPDATE users SET home_currency = $2 WHERE id = $1', [member.uid, currency]),
  );
}

async function crewCurrency(crewId: string): Promise<string | null> {
  const { rows } = await harness.pool.query<{ currency: string | null }>(
    'SELECT settlement_currency AS currency FROM crews WHERE id = $1',
    [crewId],
  );
  return rows[0]?.currency ?? null;
}

describe('crew settlement currency', () => {
  it("starts a crew in its creator's home currency", async () => {
    const founder = await harness.signIn();
    await setHome(founder, 'VND');
    const crewId = generateUuidV7();
    const created = await harness.run(founder, 'create_crew', { crew_id: crewId, name: 'Đà Nẵng' });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(await crewCurrency(crewId)).toBe('VND');
  });

  it("settles a homeless crew's currency on its first expense, by its members' majority", async () => {
    const crew = await buildMoneyCrew(harness, 3);
    expect(await crewCurrency(crew.crewId)).toBeNull();
    const [organiser, maya, alex] = crew.members as [SignedIn, SignedIn, SignedIn];
    await setHome(organiser, 'SGD');
    await setHome(maya, 'vnd');
    await setHome(alex, 'VND');

    const response = await harness.run(organiser, 'add_expense', {
      expense_id: generateUuidV7(),
      trip_id: crew.tripId,
      amount_minor: 150_000,
      currency: 'VND',
      payer_uid: organiser.uid,
      split: { mode: 'equal', shares: crew.members.map((member) => ({ user_id: member.uid })) },
      category: 'food',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(resultOf(response)).toMatchObject({ crew_amount_minor: 150_000, crew_currency: 'VND' });
    expect(await crewCurrency(crew.crewId)).toBe('VND');

    // Written once: members moving home never re-denominates money already recorded.
    await setHome(maya, 'SGD');
    await setHome(alex, 'SGD');
    const again = await harness.run(organiser, 'add_expense', {
      expense_id: generateUuidV7(),
      trip_id: crew.tripId,
      amount_minor: 30_000,
      currency: 'VND',
      payer_uid: organiser.uid,
      split: { mode: 'equal', shares: crew.members.map((member) => ({ user_id: member.uid })) },
      category: 'food',
    });
    expect(resultOf(again)).toMatchObject({ crew_currency: 'VND' });
  });

  it('settles in USD when no member has a home yet', async () => {
    const crew = await buildMoneyCrew(harness, 2);
    const response = await harness.run(crew.organiser, 'set_trip_budget', {
      trip_id: crew.tripId,
      target_minor: 50_000,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(await crewCurrency(crew.crewId)).toBe('USD');
  });
});
