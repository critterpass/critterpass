/**
 * Supplier rows for the shared permission fixture: the organiser's held Viator order with one item
 * (supplier references and a payment session set, which no app role may read), a link click of the
 * member's with its imported conversion, and a driver the organiser added (sealed contact) next to
 * one they removed.
 */
import type pg from 'pg';

export interface SuppliersFixtureInput {
  readonly tripId: string;
  readonly organiser: string;
  readonly member: string;
}

export const FIXTURE_PROVIDER_NAME = 'Matrix probe driver';
export const FIXTURE_REMOVED_PROVIDER_NAME = 'Matrix removed driver';
export const FIXTURE_SUB_ID = 'MatrixProbeSubId0001';

export async function seedSupplierRows(
  tx: pg.PoolClient,
  input: SuppliersFixtureInput,
): Promise<void> {
  const { tripId, organiser, member } = input;
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO supplier_orders (trip_id, buyer_id, supplier, partner_cart_ref, cart_ref, status,
       pricing_status, availability_status, hold_valid_until, total_minor, currency,
       payment_session_token, supplier_booking_ref)
     VALUES ($1, $2, 'viator', 'matrix-cart-0001', 'VIA-CART-1', 'holding', 'HOLDING', 'HOLDING',
       '2026-10-12T08:00:00Z', 24000, 'USD', 'matrix-session', 'BR-MATRIX')
     RETURNING id`,
    [tripId, organiser],
  );
  const orderId = rows[0]!.id;
  await tx.query(
    `INSERT INTO supplier_order_items (order_id, trip_id, item_ref, product_code,
       product_option_code, travel_date, start_time, traveller_count, price_minor, participant_ids,
       supplier_booking_ref)
     VALUES ($1, $2, 'matrix-item-0001', '5010SYDNEY', 'TG1', '2026-10-13', '09:00', 2, 24000,
       $3, 'BR-MATRIX-1')`,
    [orderId, tripId, [organiser, member]],
  );
  const click = await tx.query<{ id: string }>(
    `INSERT INTO affiliate_clicks (user_id, trip_id, partner, sub_id, target_kind, target_ref, url)
     VALUES ($1, $2, 'agoda', $3, 'stay', 'poi:matrix', 'https://www.agoda.com/')
     RETURNING id`,
    [member, tripId, FIXTURE_SUB_ID],
  );
  await tx.query(
    `INSERT INTO affiliate_conversions (partner, external_id, sub_id, click_id, status,
       commission_minor, currency, occurred_on, reported_at)
     VALUES ('agoda', 'matrix-action-1', $1, $2, 'processing', 1200, 'USD', '2026-10-01', now())`,
    [FIXTURE_SUB_ID, click.rows[0]!.id],
  );
  await tx.query(
    `INSERT INTO providers (trip_id, kind, name, contact_enc, vehicle, added_by, deleted_at)
     VALUES ($1, 'driver', $2, 'v1:matrix-contact', '{"plate": "DK 1234 AB"}', $3, NULL),
            ($1, 'driver', $4, 'v1:matrix-contact', NULL, $3, now())`,
    [tripId, FIXTURE_PROVIDER_NAME, organiser, FIXTURE_REMOVED_PROVIDER_NAME],
  );
}
