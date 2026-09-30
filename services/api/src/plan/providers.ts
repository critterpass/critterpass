/**
 * The seams other areas plug into a change set: the supplier layer's hold expiries and the bookings
 * layer's booking impact, both asked through a query function bound to the caller's transaction.
 */
import { DomainError, getBookingImpactProvider, type ProviderQuery } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import type { ChangeSetRow } from './changeset-store';

export function queryIn(tx: pg.PoolClient): ProviderQuery {
  return async <Row extends object>(sql: string, params: readonly unknown[]) =>
    (await tx.query<Row>(sql, [...params])).rows;
}

/** Bookings the accepted ops touch (on the base version), for the impact provider. */
async function bookedItems(tx: pg.PoolClient, row: ChangeSetRow): Promise<Map<string, string>> {
  const targets = row.ops.filter((op) => op.accepted !== false).map((op) => op.target);
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ stable_id: string; booking_id: string }>(
      `SELECT stable_id, booking_id FROM plan_items
        WHERE version_id = $1 AND stable_id = ANY ($2::uuid[]) AND booking_id IS NOT NULL`,
      [row.base_version_id, targets],
    ),
  );
  return new Map(rows.map((r) => [r.stable_id, r.booking_id]));
}

/** Whether applying needs an organiser's confirmation; a supplier refusal blocks it outright. */
export async function bookingImpactOf(
  tx: pg.PoolClient,
  row: ChangeSetRow,
): Promise<{ readonly needsOrganiser: boolean }> {
  const impacts = await getBookingImpactProvider().impactOf({
    tripId: row.trip_id,
    ops: row.ops.filter((op) => op.accepted !== false),
    bookedItems: await bookedItems(tx, row),
    query: queryIn(tx),
  });
  if (impacts.some((impact) => impact.blocked)) {
    throw new DomainError('STATE_INVALID', {
      reason: 'supplier_refused',
      stable_ids: impacts.filter((i) => i.blocked).map((i) => i.stableId),
    });
  }
  return { needsOrganiser: impacts.length > 0 };
}
