/**
 * The "{k} of {n} settled" count on a split boost's row in Your plan. Balances are netted, so a
 * share is settled when its IOU is in the ledger and its member owes nothing on the trip any more;
 * a payment for something else, or part of what they owe, leaves it open.
 */
import { describe, expect, it } from '@jest/globals';

import Database from 'better-sqlite3';

import { BOOSTS_SQL } from '../billing-rows';

type Move = readonly [
  debtor: string,
  creditor: string,
  minor: number,
  kind: string,
  source: string,
];
type Payment = readonly [from: string, to: string, minor: number, status: string];

function counts(ledger: readonly Move[], payments: readonly Payment[]) {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE trip_boosts (id TEXT, trip_id TEXT, crew_id TEXT, source TEXT, status TEXT,
      ends_at TEXT, buyer_id TEXT, split_mode TEXT, created_at TEXT);
    CREATE TABLE trips (id TEXT, destination_id TEXT);
    CREATE TABLE destinations (id TEXT, name TEXT);
    CREATE TABLE crews (id TEXT, name TEXT);
    CREATE TABLE expenses (id TEXT, boost_id TEXT, crew_currency TEXT, deleted_at TEXT);
    CREATE TABLE expense_shares (expense_id TEXT, user_id TEXT, computed_minor INTEGER);
    CREATE TABLE ledger_entries (trip_id TEXT, debtor_id TEXT, creditor_id TEXT,
      amount_minor INTEGER, currency TEXT, source_kind TEXT, source_id TEXT);
    CREATE TABLE payments (trip_id TEXT, from_id TEXT, to_id TEXT, amount_minor INTEGER,
      currency TEXT, status TEXT);
    INSERT INTO trip_boosts VALUES ('b1', 't1', 'c1', 'purchase', 'active', NULL, 'winston',
      'split', '2027-04-01T10:00:00Z');
    INSERT INTO trips VALUES ('t1', NULL);
    INSERT INTO expenses VALUES ('e1', 'b1', 'USD', NULL);
    INSERT INTO expense_shares VALUES ('e1', 'winston', 202), ('e1', 'maya', 199),
      ('e1', 'jordan', 199);
  `);
  const entry = sqlite.prepare(`INSERT INTO ledger_entries VALUES ('t1', ?, ?, ?, 'USD', ?, ?)`);
  for (const move of ledger) entry.run(...move);
  const payment = sqlite.prepare(`INSERT INTO payments VALUES ('t1', ?, ?, ?, 'USD', ?)`);
  for (const row of payments) payment.run(...row);
  const row = sqlite.prepare(BOOSTS_SQL).get() as { owing: number; settled: number };
  return [row.settled, row.owing];
}

const IOUS: readonly Move[] = [
  ['maya', 'winston', 199, 'boost_iou', 'e1'],
  ['jordan', 'winston', 199, 'boost_iou', 'e1'],
];
const DINNER: Move = ['maya', 'winston', 2000, 'expense', 'e-dinner'];
/** A confirmed payment is a ledger move from the payee back to the payer. */
const confirmed = (from: string, to: string, minor: number): Move => [
  to,
  from,
  minor,
  'payment',
  `p-${from}-${minor}`,
];

describe('settled shares of a split boost in Your plan', () => {
  it('counts nobody while every share is open, or before the IOUs reach the ledger', () => {
    expect(counts(IOUS, [])).toEqual([0, 2]);
    expect(counts([], [])).toEqual([0, 2]);
  });

  it('does not count a member who repaid the buyer for something else', () => {
    expect(counts([...IOUS, DINNER, confirmed('maya', 'winston', 2000)], [])).toEqual([0, 2]);
    expect(counts([...IOUS, DINNER], [['maya', 'winston', 2000, 'marked_paid']])).toEqual([0, 2]);
  });

  it('counts a member who paid the share, marked paid or confirmed, and not a part payment', () => {
    expect(counts(IOUS, [['maya', 'winston', 199, 'marked_paid']])).toEqual([1, 2]);
    expect(counts([...IOUS, confirmed('jordan', 'winston', 199)], [])).toEqual([1, 2]);
    expect(counts(IOUS, [['maya', 'winston', 100, 'marked_paid']])).toEqual([0, 2]);
    expect(counts(IOUS, [['maya', 'winston', 199, 'requested']])).toEqual([0, 2]);
  });

  it('nets the trip: a member owed as much elsewhere has nothing left to pay', () => {
    expect(counts([...IOUS, ['winston', 'maya', 500, 'expense', 'e-hotel']], [])).toEqual([1, 2]);
  });
});
