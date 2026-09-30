/**
 * `supplier_orders` and `supplier_order_items` (C1, RLS T read): the trip's crew reads status,
 * amounts and hold deadlines, and nobody else reads anything; no app role reads a supplier
 * reference or the payment session; the tables hold no supplier content; and the status trigger
 * allows exactly the transitions of the domain state machine.
 */
import { randomUUID } from 'node:crypto';

import { canTransition, SUPPLIER_ORDER_STATUSES, type SupplierOrderStatus } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withUser } from '../../src/tx';
import { expectCrewReadOnly, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const SERVER_COLUMNS = [
  'partner_cart_ref',
  'cart_ref',
  'payment_session_token',
  'supplier_booking_ref',
  'cancel_quote',
] as const;

/** Supplier content is never stored (docs/data-model.md §3.7). */
const CONTENT_COLUMN = /title|name|description|review|photo|image|content|summary|highlight/i;

describe('supplier orders', () => {
  it('are read by the crew of the trip only, and written by nobody through app_user', async () => {
    await expectCrewReadOnly(harness, 'supplier_orders');
    await expectCrewReadOnly(harness, 'supplier_order_items');
  });

  it('never show a supplier reference or the payment session to a member', async () => {
    const { actors } = harness.fixture;
    for (const column of SERVER_COLUMNS) {
      await expect(
        withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM supplier_orders`),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
    for (const column of ['item_ref', 'supplier_booking_ref']) {
      await expect(
        withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM supplier_order_items`),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
    const synced = await harness.rows('trip', 'organiser', { trip_id: harness.fixture.tripId });
    for (const row of synced.get('supplier_orders') ?? []) {
      for (const column of SERVER_COLUMNS) expect(row).not.toHaveProperty(column);
    }
  });

  it('are not the guide’s to read', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM supplier_orders'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('hold no supplier content columns', async () => {
    const { rows } = await harness.db.pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('supplier_orders', 'supplier_order_items')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => CONTENT_COLUMN.test(row.column_name))).toEqual([]);
  });

  it('move between states exactly as the domain machine allows', async () => {
    const { tripId, actors } = harness.fixture;
    const mismatches: string[] = [];
    for (const from of SUPPLIER_ORDER_STATUSES) {
      for (const to of SUPPLIER_ORDER_STATUSES) {
        if (from === to) continue;
        const allowed = await triggerAllows(tripId, actors.organiser, from, to);
        if (allowed !== canTransition(from, to)) mismatches.push(`${from} → ${to}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('hides an order from a member once they leave the crew', async () => {
    const { actors, tripId } = harness.fixture;
    expect(
      await visibleRows(
        harness,
        actors.exMember,
        'SELECT 1 FROM supplier_orders WHERE trip_id = $1',
        [tripId],
      ),
    ).toBe(0);
  });
});

/** Inserts an order in `from` and moves it to `to` as the system, inside a rolled-back tx. */
async function triggerAllows(
  tripId: string,
  buyer: string,
  from: SupplierOrderStatus,
  to: SupplierOrderStatus,
): Promise<boolean> {
  const client = await harness.db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO supplier_orders (trip_id, buyer_id, supplier, partner_cart_ref, status)
       VALUES ($1, $2, 'viator', $3, $4) RETURNING id`,
      [tripId, buyer, `probe-${randomUUID().slice(0, 12)}`, from],
    );
    try {
      await client.query('UPDATE supplier_orders SET status = $2 WHERE id = $1', [rows[0]!.id, to]);
      return true;
    } catch (error) {
      if (error instanceof Error && /cannot move/.test(error.message)) return false;
      throw error;
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}
