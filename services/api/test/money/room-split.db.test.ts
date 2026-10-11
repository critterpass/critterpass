/**
 * A stay expense split by room on the real stack. With no room plan the split is refused; on the
 * plan each guest pays their room's share of what the stay cost, summing exactly to the expense.
 * Moving people between rooms re-splits it in the same transaction: the old IOUs are reversed, new
 * ones written, the edit recorded and the crew still nets to zero, so someone moved out of the stay
 * gets their money back as a balance line. Split evenly instead, it no longer follows the rooms.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf, type SignedIn } from '../setup/setup-harness';
import {
  buildMoneyCrew,
  netsOf,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from './money-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
const expenseId = generateUuidV7();

const room = (key: string, nightly: number) => ({
  stay_key: 'stay-1',
  stay_type: 'villa',
  stay_nights: 4,
  key,
  capacity: 2,
  nightly_minor: nightly,
  label: key,
});

async function sharesOf(id: string): Promise<Record<string, number>> {
  const { rows } = await harness.pool.query<{ user_id: string; computed: string }>(
    'SELECT user_id, computed_minor::text AS computed FROM expense_shares WHERE expense_id = $1',
    [id],
  );
  return Object.fromEntries(rows.map((row) => [row.user_id, Number(row.computed)]));
}

async function expenseRow(id: string) {
  const { rows } = await harness.pool.query<{
    version: number;
    split_mode: string;
    split_stay_key: string | null;
  }>('SELECT version, split_mode, split_stay_key FROM expenses WHERE id = $1', [id]);
  return rows[0];
}

const total = (shares: Record<string, number>) =>
  Object.values(shares).reduce((sum, value) => sum + value, 0);

beforeAll(async () => {
  harness = await startMoneyHarness();
  crew = await buildMoneyCrew(harness, 4);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('a stay expense split by room', () => {
  it('is refused while the trip has no rooms', async () => {
    const [organiser] = crew.members as [SignedIn];
    const response = await harness.run(organiser, 'add_expense', {
      expense_id: generateUuidV7(),
      trip_id: crew.tripId,
      amount_minor: 60_000,
      currency: 'USD',
      payer_uid: organiser.uid,
      split: { mode: 'by_room', stay_key: 'stay-1' },
      category: 'stays',
    });
    expect(errorOf(response)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'no_rooms' },
    });
  });

  it('charges each guest their room, summing exactly to the expense', async () => {
    const [organiser, ari, ben, cai] = crew.members as [SignedIn, SignedIn, SignedIn, SignedIn];
    await withSystem(harness.pool, async (tx) => {
      await tx.query(
        `INSERT INTO room_plans (trip_id, stay_option_id, rooms, currency, nights)
         VALUES ($1, 'villa', $2, 'USD', 4)`,
        [crew.tripId, JSON.stringify([room('king', 15_000), room('twin', 10_000)])],
      );
      for (const [roomKey, uid] of [
        ['king', organiser.uid],
        ['king', ari.uid],
        ['twin', ben.uid],
        ['twin', cai.uid],
      ] as const) {
        await tx.query(
          `INSERT INTO room_assignments (trip_id, stay_key, room_key, user_id)
           VALUES ($1, 'stay-1', $2, $3)`,
          [crew.tripId, roomKey, uid],
        );
      }
    });
    const response = await harness.run(organiser, 'add_expense', {
      expense_id: expenseId,
      trip_id: crew.tripId,
      amount_minor: 60_000,
      currency: 'USD',
      payer_uid: organiser.uid,
      split: { mode: 'by_room', stay_key: 'stay-1' },
      category: 'stays',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    // King 600 for two against twin 400 for two, scaled to 600: 180 each in the king, 120 in the twin.
    const shares = await sharesOf(expenseId);
    expect(shares).toEqual({
      [organiser.uid]: 18_000,
      [ari.uid]: 18_000,
      [ben.uid]: 12_000,
      [cai.uid]: 12_000,
    });
    expect(total(shares)).toBe(60_000);
    expect(await expenseRow(expenseId)).toMatchObject({
      version: 1,
      split_mode: 'by_room',
      split_stay_key: 'stay-1',
    });
  });

  it('follows the rooms when people move, in the same transaction', async () => {
    const [organiser, ari, ben, cai] = crew.members as [SignedIn, SignedIn, SignedIn, SignedIn];
    const moved = await harness.run(organiser, 'set_room_assignment', {
      trip_id: crew.tripId,
      base_version: 1,
      rooms: [
        { stay_key: 'stay-1', room_key: 'king', uids: [organiser.uid] },
        { stay_key: 'stay-1', room_key: 'twin', uids: [ari.uid, ben.uid] },
      ],
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    // The king alone is 600 against the twin's 400 for two: 360, then 120 each.
    const shares = await sharesOf(expenseId);
    expect(shares).toEqual({ [organiser.uid]: 36_000, [ari.uid]: 12_000, [ben.uid]: 12_000 });
    expect(total(shares)).toBe(60_000);
    expect((await expenseRow(expenseId))?.version).toBe(2);
    const edits = await harness.pool.query(
      "SELECT 1 FROM expense_edits WHERE expense_id = $1 AND kind = 'edited'",
      [expenseId],
    );
    expect(edits.rowCount).toBe(1);
    const nets = (await netsOf(harness, crew.crewId))['USD'] ?? {};
    expect(nets[organiser.uid]).toBe(24_000);
    expect(nets[cai.uid] ?? 0).toBe(0);
    expect(Object.values(nets).reduce((sum, net) => sum + net, 0)).toBe(0);
  });

  it('stops following the rooms once split evenly', async () => {
    const [organiser, ari, ben, cai] = crew.members as [SignedIn, SignedIn, SignedIn, SignedIn];
    const even = await harness.run(organiser, 'edit_expense', {
      expense_id: expenseId,
      base_version: 2,
      patch: {
        split: {
          mode: 'equal',
          shares: [organiser, ari, ben, cai].map((member) => ({ user_id: member.uid })),
        },
      },
    });
    expect(even.status, JSON.stringify(even.body)).toBe(200);
    expect(await expenseRow(expenseId)).toMatchObject({
      version: 3,
      split_mode: 'equal',
      split_stay_key: null,
    });
    const moved = await harness.run(organiser, 'set_room_assignment', {
      trip_id: crew.tripId,
      base_version: 2,
      rooms: [{ stay_key: 'stay-1', room_key: 'king', uids: [organiser.uid, cai.uid] }],
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect((await expenseRow(expenseId))?.version).toBe(3);
    expect(total(await sharesOf(expenseId))).toBe(60_000);
  });
});
