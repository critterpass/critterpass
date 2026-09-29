/**
 * `money.autoconfirm` against a migrated Postgres: a payment marked paid eight days ago confirms
 * itself and, being the trip's last open debt, grants both members the Settled Tokek at the run's
 * time; one marked six days ago, or disputed, waits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { autoconfirmPayments } from '../../src/jobs/money/autoconfirm';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

let world: SetupWorld;
const NOW = new Date('2026-10-20T20:00:00Z');

async function payment(from: string, to: string, status: string, markedDaysAgo: number) {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO payments (crew_id, trip_id, from_id, to_id, amount_minor, currency, status,
       marked_at, created_by)
     VALUES ($1, $2, $3, $4, 2500, 'USD', $5, $6, $4) RETURNING id`,
    [
      world.crewId,
      world.tripId,
      from,
      to,
      status,
      new Date(NOW.getTime() - markedDaysAgo * 86_400_000),
    ],
  );
  return row?.id as string;
}

beforeAll(async () => {
  world = await startSetupWorld(3);
  const [payer, owes] = world.members as [string, string];
  await world.q(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
    [world.tripId, owes],
  );
  await world.q(
    `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency,
       source_kind, source_id)
     VALUES ($1, $2, $3, $4, 2500, 'USD', 'expense', gen_random_uuid())`,
    [world.crewId, world.tripId, owes, payer],
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('auto-confirming payments marked paid a week ago', () => {
  it('waits for a payment marked six days ago and never touches a disputed one', async () => {
    const [payer, owes, third] = world.members as [string, string, string];
    const recent = await payment(owes, payer, 'marked_paid', 6);
    await payment(third, payer, 'disputed', 9);
    expect(await autoconfirmPayments(world.harness.pool, NOW)).toEqual({
      confirmed: 0,
      settled: 0,
    });
    await world.q("UPDATE payments SET status = 'cancelled' WHERE id = $1 OR status = 'disputed'", [
      recent,
    ]);
  });

  it('confirms one marked eight days ago and grants the Settled Tokek when it clears the trip', async () => {
    const [payer, owes] = world.members as [string, string];
    const due = await payment(owes, payer, 'marked_paid', 8);
    expect(await autoconfirmPayments(world.harness.pool, NOW)).toEqual({
      confirmed: 1,
      settled: 1,
    });
    const [row] = await world.q<{ status: string; auto_confirmed: boolean }>(
      'SELECT status, auto_confirmed FROM payments WHERE id = $1',
      [due],
    );
    expect(row).toEqual({ status: 'confirmed', auto_confirmed: true });
    const stickers = await world.q<{ user_id: string; granted_at: Date }>(
      "SELECT user_id, granted_at FROM stickers WHERE trip_id = $1 AND kind = 'settled'",
      [world.tripId],
    );
    expect(stickers.map((s) => s.user_id).sort()).toEqual([payer, owes].sort());
    expect(stickers.every((s) => s.granted_at.getTime() === NOW.getTime())).toBe(true);
  });
});
