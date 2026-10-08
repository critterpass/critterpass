/**
 * Expenses on the real stack. A receipt-sized bill in rupiah lands as dollars at the pinned FX run,
 * with its shares, IOUs to the payer, its chat card and a crew_money hint; someone outside the trip
 * cannot add one, and a split cannot name them. Only the creator, the payer or an organiser changes
 * an expense; a change reverses the old IOUs and writes new ones, a stale version is refused, and a
 * delete leaves the crew square. Someone removed from the crew cannot be named on a new expense, yet
 * the expenses they shared can still be changed and keep their share. A settlement currency change
 * is the organiser's and re-rates later.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import {
  buildMoneyCrew,
  netsOf,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from './money-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let expenseId: string;

const each = (members: readonly SignedIn[]) => members.map((member) => ({ user_id: member.uid }));

beforeAll(async () => {
  harness = await startMoneyHarness();
  crew = await buildMoneyCrew(harness, 6);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('adding an expense', () => {
  it('records the bill in the crew currency with its shares, IOUs, chat card and hint', async () => {
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    expenseId = generateUuidV7();
    const response = await harness.run(organiser, 'add_expense', {
      expense_id: expenseId,
      trip_id: crew.tripId,
      amount_minor: 108_000_000,
      currency: 'IDR',
      fx_snapshot_id: crew.idrSnapshotId,
      payer_uid: maya.uid,
      split: { mode: 'equal', shares: each(crew.members) },
      category: 'food',
      merchant: 'Ibu Oka',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(resultOf(response)).toEqual({
      expense_id: expenseId,
      version: 1,
      crew_amount_minor: 6_820,
      crew_currency: 'USD',
    });

    const { rows: entries } = await harness.pool.query<{ creditor_id: string; amount: string }>(
      "SELECT creditor_id, amount_minor::text AS amount FROM ledger_entries WHERE source_id = $1 AND source_kind = 'expense'",
      [expenseId],
    );
    expect(entries).toHaveLength(5);
    expect(entries.every((entry) => entry.creditor_id === maya.uid)).toBe(true);
    const nets = await netsOf(harness, crew.crewId);
    expect(nets['USD']?.[maya.uid]).toBe(6_820 - 1_137);
    expect(Object.values(nets['USD'] ?? {}).reduce((sum, net) => sum + net, 0)).toBe(0);

    const card = await harness.pool.query(
      "SELECT 1 FROM messages WHERE type = 'expense' AND ref_id = $1 AND sender_id = $2",
      [expenseId, organiser.uid],
    );
    expect(card.rowCount).toBe(1);
    const hint = await harness.pool.query(
      `SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'expense.added'`,
      [`crew_money:${crew.crewId}`],
    );
    expect(hint.rowCount).toBe(1);
  });

  it('refuses someone outside the trip, and a split that names them', async () => {
    const outsider = await harness.signIn();
    const add = (session: SignedIn, shares: { user_id: string }[]) =>
      harness.run(session, 'add_expense', {
        expense_id: generateUuidV7(),
        trip_id: crew.tripId,
        amount_minor: 1_000,
        currency: 'USD',
        payer_uid: session.uid,
        split: { mode: 'equal', shares },
      });
    const denied = await add(outsider, [{ user_id: outsider.uid }]);
    expect(errorOf(denied).code).toBe('NOT_FOUND');
    const named = await add(crew.organiser, [...each(crew.members), { user_id: outsider.uid }]);
    expect(errorOf(named)).toMatchObject({ code: 'VALIDATION' });
  });
});

describe('changing an expense', () => {
  it('lets only the creator, the payer or an organiser change it', async () => {
    const rin = crew.members[4]!;
    const response = await harness.run(rin, 'edit_expense', {
      expense_id: expenseId,
      patch: { description: 'Not mine to change' },
    });
    expect(errorOf(response).code).toBe('FORBIDDEN');
  });

  it('reverses the old IOUs and writes new ones, and refuses a stale version', async () => {
    const maya = crew.members[1]!;
    const jordan = crew.members[3]!;
    const response = await harness.run(maya, 'edit_expense', {
      expense_id: expenseId,
      base_version: 1,
      patch: {
        split: {
          mode: 'equal',
          shares: each(crew.members).filter((share) => share.user_id !== jordan.uid),
        },
      },
    });
    expect(resultOf(response)).toMatchObject({ version: 2, crew_amount_minor: 6_820 });
    const { rows } = await harness.pool.query<{ reversals: number; live: number }>(
      `SELECT count(*) FILTER (WHERE source_kind = 'reversal')::int AS reversals,
              count(*) FILTER (WHERE source_kind = 'expense' AND NOT EXISTS (
                SELECT 1 FROM ledger_entries r WHERE r.reverses_id = e.id))::int AS live
         FROM ledger_entries e WHERE source_id = $1`,
      [expenseId],
    );
    expect(rows[0]).toEqual({ reversals: 5, live: 4 });
    const nets = await netsOf(harness, crew.crewId);
    expect(nets['USD']?.[jordan.uid]).toBeUndefined();
    expect(nets['USD']?.[maya.uid]).toBe(6_820 - 1_364);

    const stale = await harness.run(maya, 'edit_expense', {
      expense_id: expenseId,
      base_version: 1,
      patch: { description: 'Babi guling' },
    });
    expect(errorOf(stale)).toMatchObject({
      code: 'VERSION_CONFLICT',
      detail: { current_version: 2 },
    });
  });

  it('squares the crew again when the creator deletes it', async () => {
    const response = await harness.run(crew.organiser, 'delete_expense', { expense_id: expenseId });
    expect(resultOf(response)).toEqual({ expense_id: expenseId, version: 3 });
    expect(await netsOf(harness, crew.crewId)).toEqual({});
    const again = await harness.run(crew.organiser, 'delete_expense', { expense_id: expenseId });
    expect(errorOf(again)).toMatchObject({ code: 'STATE_INVALID' });
  });
});

describe('someone who has left the crew', () => {
  it('cannot be named on a new expense, and stays on the ones they shared', async () => {
    const leaver = crew.members[5]!;
    const stayers = crew.members.filter((member) => member.uid !== leaver.uid);
    const add = (id: string, members: readonly SignedIn[]) =>
      harness.run(crew.organiser, 'add_expense', {
        expense_id: id,
        trip_id: crew.tripId,
        amount_minor: 6_000,
        currency: 'USD',
        payer_uid: crew.organiser.uid,
        split: { mode: 'weights', shares: members.map((m) => ({ user_id: m.uid, weight: 1 })) },
        description: 'Boat',
      });
    const shared = generateUuidV7();
    expect((await add(shared, crew.members)).status).toBe(200);

    const removed = await harness.run(crew.organiser, 'remove_member', {
      crew_id: crew.crewId,
      uid: leaver.uid,
    });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const seat = await harness.pool.query<{ rsvp: string; holds_seat: boolean }>(
      'SELECT rsvp, holds_seat FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [crew.tripId, leaver.uid],
    );
    expect(seat.rows[0]).toEqual({ rsvp: 'out', holds_seat: false });

    // A new expense that still gives them a share is refused, naming them.
    const named = await add(generateUuidV7(), crew.members);
    expect(errorOf(named)).toMatchObject({
      code: 'VALIDATION',
      detail: { reason: 'not_in_trip', user_ids: [leaver.uid] },
    });
    const later = generateUuidV7();
    expect((await add(later, stayers)).status).toBe(200);

    // The expense they shared can still be changed, and keeps their share.
    const renamed = await harness.run(crew.organiser, 'edit_expense', {
      expense_id: shared,
      base_version: 1,
      patch: { description: 'Boat tickets' },
    });
    expect(resultOf(renamed)).toMatchObject({ expense_id: shared, version: 2 });
    const share = await harness.pool.query<{ minor: string }>(
      'SELECT computed_minor::text AS minor FROM expense_shares WHERE expense_id = $1 AND user_id = $2',
      [shared, leaver.uid],
    );
    expect(share.rows).toEqual([{ minor: '1000' }]);

    // An edit cannot add them to an expense they were never on.
    const added = await harness.run(crew.organiser, 'edit_expense', {
      expense_id: later,
      base_version: 1,
      patch: {
        split: { mode: 'equal', shares: each(crew.members) },
      },
    });
    expect(errorOf(added)).toMatchObject({
      code: 'VALIDATION',
      detail: { reason: 'not_in_trip', user_ids: [leaver.uid] },
    });
  });
});

describe('the settlement currency', () => {
  it('is the crew organiser’s to change, and queues the re-rate', async () => {
    const member = crew.members[2]!;
    const denied = await harness.run(member, 'set_crew_settlement_currency', {
      crew_id: crew.crewId,
      currency: 'SGD',
    });
    expect(errorOf(denied).code).toBe('FORBIDDEN');
    const changed = await harness.run(crew.organiser, 'set_crew_settlement_currency', {
      crew_id: crew.crewId,
      currency: 'SGD',
    });
    expect(resultOf(changed)).toEqual({ crew_id: crew.crewId, currency: 'SGD', changed: true });
    const job = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'money.rerate' AND data->>'crew_id' = $1",
      [crew.crewId],
    );
    expect(job.rowCount).toBe(1);
  });
});
