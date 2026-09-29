/**
 * `ledger_entries` (C1, RLS M) and the `member_balances` view: the crew reads its ledger through
 * `crews`; a member who left still reads the entries that name them and nothing else; no role can
 * change or remove an entry; and erasure swaps a user for a tombstone only as the system, leaving
 * every balance where it was.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { expectCrewLedgerTable } from '../helpers/money-fixture';
import { asRole } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

async function netsOf(crewId: string): Promise<Map<string, bigint>> {
  const { rows } = await harness.db.pool.query<{ user_id: string; net_minor: string }>(
    'SELECT user_id, net_minor FROM member_balances WHERE crew_id = $1',
    [crewId],
  );
  return new Map(rows.map((row) => [row.user_id, BigInt(row.net_minor)]));
}

describe('ledger_entries', () => {
  it('is crew-visible, read-only and synced with the crew', async () => {
    await expectCrewLedgerTable(harness, 'ledger_entries');
  });

  it('shows a former member the entries that name them, and only those', async () => {
    const { actors, crewId, tripId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor,
           currency, source_kind, source_id)
         VALUES ($1, $2, $3, $4, 1250, 'USD', 'expense', $5)`,
        [crewId, tripId, actors.exMember, actors.organiser, randomUUID()],
      ),
    );
    const { rows } = await as(actors.exMember, 'SELECT debtor_id FROM ledger_entries');
    expect(rows).toEqual([{ debtor_id: actors.exMember }]);
  });

  it('refuses every change and removal, whoever asks', async () => {
    const { actors } = harness.fixture;
    const change = 'UPDATE ledger_entries SET amount_minor = amount_minor + 1';
    await expect(as(actors.organiser, change)).rejects.toThrow(/permission denied/i);
    await expect(withSystem(harness.db.pool, (tx) => tx.query(change))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asRole(harness.db.pool, 'admin_reader', change)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asRole(harness.db.pool, 'powersync_repl', change)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, harness.fixture.tripId, (tx) =>
        tx.query(change),
      ),
    ).rejects.toThrow(/permission denied/i);
    // The owner holds every privilege; the append-only trigger still refuses it.
    await expect(harness.db.pool.query(change)).rejects.toThrow(/append-only/i);
    await expect(harness.db.pool.query('DELETE FROM ledger_entries')).rejects.toThrow(
      /append-only/i,
    );
    await expect(harness.db.pool.query('TRUNCATE ledger_entries CASCADE')).rejects.toThrow(
      /append-only/i,
    );
  });

  it('nets every crew to zero, and erasure keeps each balance while naming a tombstone', async () => {
    const { actors, crewId } = harness.fixture;
    const before = await netsOf(crewId);
    expect([...before.values()].reduce((sum, net) => sum + net, 0n)).toBe(0n);

    await expect(
      as(actors.member, 'SELECT app.pseudonymise_user($1)', [actors.member]),
    ).rejects.toThrow(/permission denied/i);

    const tombstone = await withSystem(harness.db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT app.pseudonymise_user($1) AS id', [
        actors.member,
      ]);
      return rows[0]!.id;
    });
    const after = await netsOf(crewId);
    expect(after.has(actors.member)).toBe(false);
    expect(after.get(tombstone)).toBe(before.get(actors.member));
    expect(after.get(actors.organiser)).toBe(before.get(actors.organiser));
    expect([...after.values()].reduce((sum, net) => sum + net, 0n)).toBe(0n);
    const { rows } = await harness.db.pool.query(
      `SELECT 1 FROM ledger_entries WHERE $1 IN (debtor_id, creditor_id)
       UNION ALL SELECT 1 FROM expense_shares WHERE user_id = $1
       UNION ALL SELECT 1 FROM payments WHERE $1 IN (from_id, to_id)`,
      [actors.member],
    );
    expect(rows).toEqual([]);
  });
});
