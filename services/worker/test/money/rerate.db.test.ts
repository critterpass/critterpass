/**
 * `money.rerate` against a migrated Postgres: a crew with a rupiah dinner (kept in dollars), a
 * confirmed payback, an open request and a payment marked paid switches its settlement currency to
 * Singapore dollars. Every dollar balance nets out, the crew is restated in SGD at the dinner's own
 * FX run, the open request is cancelled, the marked payment is restated, and a second run changes
 * nothing.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rerateCrew } from '../../src/jobs/money/rerate';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

let world: SetupWorld;
let expenseId: string;

beforeAll(async () => {
  world = await startSetupWorld(4);
  const [m0, m1, m2, m3] = world.members as [string, string, string, string];
  for (const uid of [m1, m2, m3]) {
    await world.q(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [world.tripId, uid],
    );
  }
  const source = `rerate-${randomUUID().slice(0, 8)}`;
  await world.q(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
     VALUES ('USD', 'SGD', 1.35, '2026-10-14', $1)`,
    [source],
  );
  const [snapshot] = await world.q<{ id: string }>(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
     VALUES ('USD', 'IDR', 15835, '2026-10-14', $1) RETURNING id`,
    [source],
  );
  // Rp 1.000.000 (sen) paid by m0, split four ways: $63.15 as 15.79/15.79/15.79/15.78.
  const [expense] = await world.q<{ id: string }>(
    `INSERT INTO expenses (crew_id, trip_id, payer_id, amount_minor, currency, fx_snapshot_id,
       crew_amount_minor, crew_currency, split_mode, local_date, spent_at, created_by)
     VALUES ($1, $2, $3, 100000000, 'IDR', $4, 6315, 'USD', 'equal', '2026-10-14', now(), $3)
     RETURNING id`,
    [world.crewId, world.tripId, m0, snapshot?.id],
  );
  expenseId = expense?.id as string;
  for (const [uid, crewShare] of [
    [m0, 1579],
    [m1, 1579],
    [m2, 1579],
    [m3, 1578],
  ] as const) {
    await world.q(
      `INSERT INTO expense_shares (expense_id, trip_id, user_id, computed_minor, crew_computed_minor)
       VALUES ($1, $2, $3, 25000000, $4)`,
      [expenseId, world.tripId, uid, crewShare],
    );
    if (uid !== m0) {
      await world.q(
        `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor,
           currency, source_kind, source_id)
         VALUES ($1, $2, $3, $4, $5, 'USD', 'expense', $6)`,
        [world.crewId, world.tripId, uid, m0, crewShare, expenseId],
      );
    }
  }
  const payment = async (from: string, amount: number, status: string) => {
    const [row] = await world.q<{ id: string }>(
      `INSERT INTO payments (crew_id, trip_id, from_id, to_id, amount_minor, currency, status,
         confirmed_at, created_by)
       VALUES ($1, $2, $3, $4, $5, 'USD', $6, CASE WHEN $6 = 'confirmed' THEN now() END, $4)
       RETURNING id`,
      [world.crewId, world.tripId, from, m0, amount, status],
    );
    return row?.id as string;
  };
  const paid = await payment(m1, 1579, 'confirmed');
  await world.q(
    `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency,
       source_kind, source_id)
     VALUES ($1, $2, $3, $4, 1579, 'USD', 'payment', $5)`,
    [world.crewId, world.tripId, m0, m1, paid],
  );
  await payment(m2, 1579, 'requested');
  await payment(m3, 1578, 'marked_paid');
  await world.q("UPDATE crews SET settlement_currency = 'SGD' WHERE id = $1", [world.crewId]);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

async function nets(currency: string): Promise<Record<string, number>> {
  const rows = await world.q<{ user_id: string; net: string }>(
    `SELECT user_id, net_minor::text AS net FROM member_balances
      WHERE crew_id = $1 AND currency = $2 AND net_minor <> 0`,
    [world.crewId, currency],
  );
  return Object.fromEntries(rows.map((row) => [row.user_id, Number(row.net)]));
}

describe('re-rating a crew into a new settlement currency', () => {
  it('restates the ledger in SGD and leaves nothing owed in dollars', async () => {
    const [m0, m1, m2, m3] = world.members as [string, string, string, string];
    expect(await rerateCrew(world.harness.pool, world.crewId)).toEqual({
      currency: 'SGD',
      expenses: 1,
      payments: 1,
      cancelled: 1,
    });
    expect(await nets('USD')).toEqual({});
    // S$85.25 (Rp 1.000.000 at 15,835 IDR and 1.35 SGD a dollar), the payer's odd cent first; the
    // $15.79 payback is S$21.32.
    expect(await nets('SGD')).toEqual({
      [m0]: 3 * 2_131 - 2_132,
      [m1]: 2_132 - 2_131,
      [m2]: -2_131,
      [m3]: -2_131,
    });
    const [expense] = await world.q<{ crew_currency: string; crew_amount_minor: string }>(
      'SELECT crew_currency, crew_amount_minor::text FROM expenses WHERE id = $1',
      [expenseId],
    );
    expect(expense).toEqual({ crew_currency: 'SGD', crew_amount_minor: '8525' });
    const payments = await world.q<{ status: string; currency: string; amount_minor: string }>(
      `SELECT status, currency, amount_minor::text FROM payments WHERE crew_id = $1
        ORDER BY created_at`,
      [world.crewId],
    );
    expect(payments).toEqual([
      { status: 'confirmed', currency: 'USD', amount_minor: '1579' },
      { status: 'cancelled', currency: 'USD', amount_minor: '1579' },
      { status: 'marked_paid', currency: 'SGD', amount_minor: '2130' },
    ]);
  });

  it('changes nothing when it runs again', async () => {
    expect(await rerateCrew(world.harness.pool, world.crewId)).toEqual({
      currency: 'SGD',
      expenses: 0,
      payments: 0,
      cancelled: 0,
    });
  });
});
