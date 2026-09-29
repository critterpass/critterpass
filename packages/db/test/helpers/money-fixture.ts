/**
 * Money rows for the shared permission fixture: the organiser paid a USD 600.00 dinner on the
 * fixture trip split evenly with the member (shares, the created edit, the member's ledger entry),
 * the member was asked to pay it back, and the organiser holds a queued receipt scan, a PayNow
 * payout method and the trip's Settled Tokek. Plus the checks the money permission suites share.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { expect } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from './setup-privacy';
import type { StreamHarness } from './stream-harness';

export interface MoneyFixtureInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly organiser: string;
  readonly member: string;
}

/** The fixture dinner's amount (USD minor units); a sentinel suites look rows up by. */
export const FIXTURE_EXPENSE_MINOR = 60_000;

export async function seedMoneyRows(tx: pg.PoolClient, input: MoneyFixtureInput): Promise<void> {
  const { crewId, tripId, organiser, member } = input;
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO expenses (crew_id, trip_id, payer_id, amount_minor, currency, crew_amount_minor,
       crew_currency, split_mode, category, description, local_date, spent_at, created_by)
     VALUES ($1, $2, $3, $4, 'USD', $4, 'USD', 'equal', 'food', 'Dinner', current_date, now(), $3)
     RETURNING id`,
    [crewId, tripId, organiser, FIXTURE_EXPENSE_MINOR],
  );
  const expenseId = rows[0]!.id;
  const half = FIXTURE_EXPENSE_MINOR / 2;
  for (const uid of [organiser, member]) {
    await tx.query(
      `INSERT INTO expense_shares (expense_id, trip_id, user_id, computed_minor, crew_computed_minor)
       VALUES ($1, $2, $3, $4, $4)`,
      [expenseId, tripId, uid, half],
    );
  }
  await tx.query(
    `INSERT INTO expense_edits (expense_id, trip_id, editor_id, kind, after)
     VALUES ($1, $2, $3, 'created', '{"amount_minor":60000}')`,
    [expenseId, tripId, organiser],
  );
  await tx.query(
    `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency,
       source_kind, source_id)
     VALUES ($1, $2, $3, $4, $5, 'USD', 'expense', $6)`,
    [crewId, tripId, member, organiser, half, expenseId],
  );
  await tx.query(
    `INSERT INTO payments (crew_id, trip_id, from_id, to_id, amount_minor, currency, status,
       requested_at, created_by)
     VALUES ($1, $2, $3, $4, $5, 'USD', 'requested', now(), $4)`,
    [crewId, tripId, member, organiser, half],
  );
  await tx.query(
    `INSERT INTO receipts (user_id, trip_id, crew_id, media_key, ocr_lines)
     VALUES ($1, $2, $3, 'receipts/matrix-probe.jpg', '[{"id":"l0","text":"TOTAL 600.00"}]')`,
    [organiser, tripId, crewId],
  );
  await tx.query(
    `INSERT INTO payout_methods (user_id, kind, country, label, details_enc)
     VALUES ($1, 'paynow', 'SG', 'PayNow', 'v1:matrix-probe')`,
    [organiser],
  );
  await tx.query(
    `INSERT INTO stickers (user_id, crew_id, trip_id, kind, granted_at)
     VALUES ($1, $2, $3, 'settled', now())`,
    [organiser, crewId, tripId],
  );
}

/**
 * A crew-level money table synced by `crews`: active members read the fixture row, the outsider,
 * the ex-member (not named on it) and an anonymous uid do not, app_user writes nothing, and the
 * stream carries it to members only.
 */
export async function expectCrewLedgerTable(harness: StreamHarness, table: string): Promise<void> {
  const { actors, crewId } = harness.fixture;
  const probe = `SELECT 1 FROM ${table} WHERE crew_id = $1`;
  for (const kind of ['member', 'organiser', 'coOrganiser'] as const) {
    expect(await visibleRows(harness, actors[kind], probe, [crewId]), kind).toBeGreaterThan(0);
  }
  for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
    expect(await visibleRows(harness, actors[kind], probe, [crewId]), kind).toBe(0);
  }
  await expect(
    withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
      tx.query(`UPDATE ${table} SET crew_id = crew_id WHERE crew_id = $1`, [crewId]),
    ),
  ).rejects.toThrow(/permission denied/i);
  for (const kind of ['member', 'organiser'] as const) {
    const synced = await harness.rows('crews', kind);
    expect(synced.get(table)?.length ?? 0, `${table} streamed to ${kind}`).toBeGreaterThan(0);
  }
  for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
    const synced = await harness.rows('crews', kind);
    expect(synced.get(table)?.length ?? 0, `${table} streamed to ${kind}`).toBe(0);
  }
}
