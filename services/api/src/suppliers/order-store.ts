/**
 * The supplier order as the server holds it: read and locked as the system (app_user never sees
 * supplier references), moved only along the domain state machine (the table's trigger refuses
 * anything else too), and priced in minor units of the currency the supplier quoted.
 */
import { currencyExponent } from '@cp/cost-engine';
import {
  assertTransition,
  DEFAULT_MIN_VOTE_WINDOW_MIN,
  DomainError,
  MIN_VOTE_WINDOW_CONFIG_KEY,
  type SupplierOrderStatus,
} from '@cp/domain';
import { requirePartnerEnabled, VIATOR_PARTNER_KEY } from '@cp/suppliers';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';

export interface OrderRow {
  readonly id: string;
  readonly trip_id: string;
  readonly buyer_id: string;
  readonly supplier: string;
  readonly stable_id: string | null;
  readonly partner_cart_ref: string;
  readonly cart_ref: string | null;
  readonly status: SupplierOrderStatus;
  readonly hold_valid_until: Date | null;
  readonly total_minor: string | null;
  readonly currency: string | null;
  readonly payment_session_token: string | null;
  readonly voucher_booking_id: string | null;
  readonly cancel_quote: Record<string, unknown> | null;
}

export interface OrderItemRow {
  readonly id: string;
  readonly item_ref: string;
  readonly product_code: string;
  readonly travel_date: string;
  readonly start_time: string | null;
  readonly traveller_count: number;
  readonly participant_ids: string[];
  readonly supplier_booking_ref: string | null;
}

const ORDER_COLUMNS = `id, trip_id, buyer_id, supplier, stable_id, partner_cart_ref, cart_ref, status,
  hold_valid_until, total_minor::text AS total_minor, currency, payment_session_token,
  voucher_booking_id, cancel_quote`;

/** The order under a row lock, or `NOT_FOUND`. */
export async function lockOrder(tx: pg.PoolClient, orderId: string): Promise<OrderRow> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM supplier_orders WHERE id = $1 FOR UPDATE`, [
      orderId,
    ]),
  );
  const order = rows[0];
  if (order === undefined) throw new DomainError('NOT_FOUND', { reason: 'order' });
  return order;
}

export async function findOrder(tx: pg.PoolClient, orderId: string): Promise<OrderRow | null> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM supplier_orders WHERE id = $1`, [orderId]),
  );
  return rows[0] ?? null;
}

export async function orderItems(tx: pg.PoolClient, orderId: string): Promise<OrderItemRow[]> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<OrderItemRow>(
      `SELECT id, item_ref, product_code, travel_date::text AS travel_date, start_time,
              traveller_count, participant_ids, supplier_booking_ref
         FROM supplier_order_items WHERE order_id = $1 ORDER BY created_at, id`,
      [orderId],
    ),
  );
  return rows;
}

/** Moves the order (checked against the machine) and sets any other columns alongside. */
export async function moveOrder(
  tx: pg.PoolClient,
  order: Pick<OrderRow, 'id' | 'status'>,
  to: SupplierOrderStatus,
  fields: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  if (to !== order.status) assertTransition(order.status, to);
  const entries = Object.entries(fields);
  const sets = [
    'status = $2',
    'version = version + 1',
    ...entries.map(([column], i) => `${column} = $${i + 3}`),
  ];
  await asSystemRole(tx, () =>
    tx.query(`UPDATE supplier_orders SET ${sets.join(', ')} WHERE id = $1`, [
      order.id,
      to,
      ...entries.map(([, value]) => value),
    ]),
  );
}

/** Supplier amounts arrive in major units; the ledger and the wallet keep minor units. */
export function toMinor(amount: number, currency: string): bigint {
  return BigInt(Math.round(amount * 10 ** currencyExponent(currency)));
}

/** `SUPPLIER_UNAVAILABLE` unless the Viator booking switch is on. */
export function requireViatorOn(tx: pg.PoolClient): Promise<void> {
  return requirePartnerEnabled(
    (sql, params) => asSystemRole(tx, () => tx.query(sql, [...params])),
    VIATOR_PARTNER_KEY,
  );
}

/** The shortest vote window a hold must leave the crew (ops config, default 60 minutes). */
export async function minVoteWindowMin(tx: pg.PoolClient): Promise<number> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ value: unknown }>('SELECT value FROM ops.ops_config WHERE key = $1', [
      MIN_VOTE_WINDOW_CONFIG_KEY,
    ]),
  );
  const value = rows[0]?.value;
  return typeof value === 'number' && value > 0 ? value : DEFAULT_MIN_VOTE_WINDOW_MIN;
}
