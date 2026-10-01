/**
 * `add_past_trip` / `remove_past_trip` (3n-1 back-fill;
 * docs/api-contracts-you.md): self-reported trips count toward TRIPS and COUNTRIES and show as
 * SELF-REPORTED stamps, never toward critters. The client picks the id, so a replay is a no-op;
 * removal is a soft delete that drops the row from the `me` stream.
 */
import { appendDomainEvent } from '@cp/db';
import { addPastTripPayloadSchema, DomainError, removePastTripPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';

async function emit(
  tx: pg.PoolClient,
  type: 'past_trip.added' | 'past_trip.removed',
  uid: string,
  pastTripId: string,
): Promise<void> {
  await appendDomainEvent(tx, {
    type,
    aggregateKind: 'user',
    aggregateId: uid,
    actorKind: 'user',
    actorId: uid,
    payload: { user_id: uid, past_trip_id: pastTripId },
  });
}

export const addPastTripCommand = defineCommand({
  name: 'add_past_trip',
  v: 1,
  schema: addPastTripPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<{ past_trip_id: string; added: boolean }> => {
    const inserted = await tx.query(
      `INSERT INTO past_trips (id, user_id, place_id, country, month)
       VALUES ($1, $2, $3, $4, ($5 || '-01')::date) ON CONFLICT (id) DO NOTHING`,
      [payload.past_trip_id, ctx.uid, payload.place_id, payload.country, payload.month],
    );
    const added = (inserted.rowCount ?? 0) > 0;
    if (!added) {
      const own = await tx.query('SELECT 1 FROM past_trips WHERE id = $1', [payload.past_trip_id]);
      // Another user's row holds this id (hidden by RLS): never reveal it.
      if (own.rowCount === 0) throw new DomainError('VALIDATION', { reason: 'past_trip_id_taken' });
      return { past_trip_id: payload.past_trip_id, added: false };
    }
    await emit(tx, 'past_trip.added', ctx.uid, payload.past_trip_id);
    return { past_trip_id: payload.past_trip_id, added: true };
  },
});

export const removePastTripCommand = defineCommand({
  name: 'remove_past_trip',
  v: 1,
  schema: removePastTripPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rowCount } = await tx.query('SELECT 1 FROM past_trips WHERE id = $1', [
      payload.past_trip_id,
    ]);
    if (rowCount === 0) throw new DomainError('NOT_FOUND');
  },
  handle: async (tx, payload, ctx): Promise<{ past_trip_id: string; removed: boolean }> => {
    const updated = await tx.query(
      'UPDATE past_trips SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [payload.past_trip_id, ctx.uid],
    );
    const removed = (updated.rowCount ?? 0) > 0;
    if (removed) await emit(tx, 'past_trip.removed', ctx.uid, payload.past_trip_id);
    return { past_trip_id: payload.past_trip_id, removed };
  },
});
