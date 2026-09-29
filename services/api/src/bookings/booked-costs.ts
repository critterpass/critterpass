/**
 * The bookings-backed `BookedCostProvider` for the trip budget forecast: the trip's live crew
 * bookings that carry a price and that no live expense points at yet, read in the caller's
 * transaction (so RLS keeps it to what the caller may see). Personal bookings are the traveller's
 * own spend and never enter the crew's forecast.
 */
import {
  bookedNotYetExpensed,
  registerBookedCostProvider,
  type BookedCost,
  type BookingKind,
} from '@cp/domain';
import type pg from 'pg';

export async function bookedCostsOf(
  tx: pg.PoolClient,
  tripId: string,
): Promise<readonly BookedCost[]> {
  const bookings = await tx.query<{
    id: string;
    type: BookingKind;
    status: string;
    deleted: boolean;
    price_minor: string | null;
    currency: string | null;
    starts_at: Date | null;
  }>(
    `SELECT id, type, status, deleted_at IS NOT NULL AS deleted, price_minor::text AS price_minor,
            currency, starts_at
       FROM bookings WHERE trip_id = $1 AND visibility = 'crew'`,
    [tripId],
  );
  const expensed = await tx.query<{ booking_id: string }>(
    `SELECT DISTINCT booking_id FROM expenses
      WHERE trip_id = $1 AND booking_id IS NOT NULL AND deleted_at IS NULL`,
    [tripId],
  );
  return bookedNotYetExpensed(
    bookings.rows.map((row) => ({
      id: row.id,
      kind: row.type,
      status: row.status,
      deleted: row.deleted,
      priceMinor: row.price_minor === null ? null : BigInt(row.price_minor),
      currency: row.currency,
      startsAt: row.starts_at?.toISOString() ?? null,
    })),
    new Set(expensed.rows.map((row) => row.booking_id)),
  );
}

export function registerBookedCosts(): void {
  registerBookedCostProvider<pg.PoolClient>(bookedCostsOf);
}
