/**
 * The guide's wallet tools (docs/api-contracts.md §6). `bookings_read` lists the trip's crew
 * bookings through `llm.bookings` as `guide_reader`: kinds, times, places, status and the real
 * free-cancellation deadline from the user's own confirmation (the guide quotes it, never invents
 * one). Personal bookings, barcodes, documents, prices and confirmation codes never reach it.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { withGuideReader } from '@cp/db';
import { DomainError } from '@cp/domain';
import { withUser } from '@cp/db';
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
  registry.registerToolExecutor('flight_status', (input, context) =>
    withUser(pool, context.uid, 'guide', async (tx) => {
      const ident = /^([A-Z][A-Z0-9]|[0-9][A-Z])\s*0*(\d{1,4}[A-Z]?)$/u.exec(
        input.flight_no.trim().toUpperCase(),
      );
      if (ident === null) throw new DomainError('VALIDATION', { reason: 'flight_no' });
      const { rows } = await tx.query<{
        status: string;
        sched_dep_at: Date;
        est_dep_at: Date | null;
        gate: string | null;
        status_source: string;
        status_at: Date | null;
        updated_at: Date;
      }>(
        `SELECT status, sched_dep_at, est_dep_at, gate, status_source, status_at, updated_at
           FROM flight_segments
          WHERE carrier = $1 AND flight_no = $2
            AND sched_dep_at BETWEEN $3::date - interval '1 day' AND $3::date + interval '2 days'
          ORDER BY abs(extract(epoch FROM sched_dep_at - $3::date)) LIMIT 1`,
        [ident[1], ident[2], input.date],
      );
      const row = rows[0];
      if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'flight_not_in_wallet' });
      return {
        status: row.status,
        sched: row.sched_dep_at.toISOString(),
        est: row.est_dep_at?.toISOString() ?? null,
        gate: row.gate,
        source: row.status_source,
        at: (row.status_at ?? row.updated_at).toISOString(),
      };
    }),
  );
}
