/**
 * The guide's wallet tools (docs/api-contracts.md §6). `bookings_read` lists the trip's crew
 * bookings through `llm.bookings` as `guide_reader`: kinds, times, places, status and the real
 * free-cancellation deadline from the user's own confirmation (the guide quotes it, never invents
 * one). Personal bookings, barcodes, documents, prices and confirmation codes never reach it.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { withGuideReader } from '@cp/db';
import { DomainError } from '@cp/domain';
import type pg from 'pg';

/** The turn's trip only: the model cannot point a tool at another trip. */
export function tripOf(context: ToolContext, requested: string): string {
  if (context.tripId !== null && context.tripId !== requested) {
    throw new DomainError('FORBIDDEN', { reason: 'other_trip' });
  }
  return requested;
}

interface WalletRow {
  readonly id: string;
  readonly type: string;
  readonly starts_at: Date | null;
  readonly location: string | null;
  readonly free_cancel_until: Date | null;
  readonly status: string;
}

export function registerBookingToolExecutors(registry: ToolRegistry, pool: pg.Pool): void {
  registry.registerToolExecutor('bookings_read', (input, context) => {
    const tripId = tripOf(context, input.trip_id);
    return withGuideReader(pool, context.uid, tripId, async (tx) => {
      const { rows } = await tx.query<WalletRow>(
        `SELECT id, type, starts_at, location, free_cancel_until, status FROM llm.bookings
          WHERE trip_id = $1 ORDER BY starts_at NULLS LAST, id LIMIT 50`,
        [tripId],
      );
      return rows.map((row) => ({
        booking_id: row.id,
        kind: row.type,
        when: row.starts_at?.toISOString() ?? null,
        where: row.location,
        cancel_deadline: row.free_cancel_until?.toISOString() ?? null,
        status: row.status,
      }));
    });
  });
}
