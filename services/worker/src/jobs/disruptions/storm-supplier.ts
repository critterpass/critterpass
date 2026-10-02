/**
 * A storm swap's new Viator booking did not happen: its hold expired or was let go, or the booking
 * was refused (payment failed). The old booking is untouched and stays active; the disruption says
 * so ("Seats for Saturday weren't confirmed — Friday booking kept") and closes.
 */
import { outbox } from '@cp/db';
import { channelName } from '@cp/domain';
import type pg from 'pg';

import type { ReactEvent } from './react';

export async function seatsNotConfirmed(tx: pg.PoolClient, event: ReactEvent): Promise<number> {
  const orderId = event.payload['order_id'];
  if (typeof orderId !== 'string') return 0;
  const { rows } = await tx.query<{
    id: string;
    trip_id: string;
    options: { id: string; supplier_move?: Record<string, unknown> }[];
  }>(
    `SELECT id, trip_id, options FROM disruptions
      WHERE kind = 'storm' AND status = 'open'
        AND options @> jsonb_build_array(jsonb_build_object(
              'supplier_move', jsonb_build_object('new_order_id', $1::text)))
      FOR UPDATE`,
    [orderId],
  );
  let moved = 0;
  for (const storm of rows) {
    const options = storm.options.map((option) =>
      option.supplier_move?.['new_order_id'] === orderId
        ? { ...option, supplier_move: { ...option.supplier_move, state: 'seats_not_confirmed' } }
        : option,
    );
    await tx.query(
      `UPDATE disruptions SET options = $2, status = 'resolved', resolved_at = now(),
              version = version + 1
        WHERE id = $1`,
      [storm.id, JSON.stringify(options)],
    );
    await outbox(tx, channelName('trip_watch', storm.trip_id), 'disruption.step', {
      disruption_id: storm.id,
      action_id: 'supplier_move',
      state: 'seats_not_confirmed',
    });
    moved += 1;
  }
  return moved;
}
