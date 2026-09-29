/**
 * `save_place` / `unsave_place` (docs/api-contracts.md §4.3): ♡ SAVE on a place page keeps it in the
 * caller's saved places (synced on `me`); saving twice is a no-op. `request_place` keeps a city
 * nobody covers yet, asked for from an empty search, as the caller's own request.
 */
import { createHash } from 'node:crypto';

import { appendDomainEvent } from '@cp/db';
import { DomainError, requestPlacePayloadSchema, savePlacePayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

async function requirePlace(tx: pg.PoolClient, placeId: string): Promise<void> {
  const { rows } = await tx.query('SELECT 1 FROM destinations WHERE id = $1', [placeId]);
  if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'place' });
}

function placeEvent(type: 'place.saved' | 'place.unsaved', uid: string, placeId: string) {
  return {
    type,
    aggregateKind: 'user',
    aggregateId: uid,
    actorKind: 'user' as const,
    actorId: uid,
    payload: { user_id: uid, place_id: placeId },
  };
}

export const savePlaceCommand = defineCommand({
  name: 'save_place',
  v: 1,
  schema: savePlacePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) => requirePlace(tx, payload.place_id),
  handle: async (tx, payload, ctx): Promise<{ place_id: string; saved: true }> => {
    const { rowCount } = await tx.query(
      `INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'place', $2)
       ON CONFLICT (user_id, kind, ref_id) DO NOTHING`,
      [ctx.uid, payload.place_id],
    );
    if ((rowCount ?? 0) > 0)
      await appendDomainEvent(tx, placeEvent('place.saved', ctx.uid, payload.place_id));
    return { place_id: payload.place_id, saved: true };
  },
});

export const unsavePlaceCommand = defineCommand({
  name: 'unsave_place',
  v: 1,
  schema: savePlacePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<{ place_id: string; saved: false }> => {
    const removed = await asSystemRole(tx, () =>
      tx.query("DELETE FROM saved_items WHERE user_id = $1 AND kind = 'place' AND ref_id = $2", [
        ctx.uid,
        payload.place_id,
      ]),
    );
    if ((removed.rowCount ?? 0) > 0) {
      await appendDomainEvent(tx, placeEvent('place.unsaved', ctx.uid, payload.place_id));
    }
    return { place_id: payload.place_id, saved: false };
  },
});

/** A stable id for one normalised request, so asking twice keeps one row. */
export function requestRefId(query: string): string {
  const hex = createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const requestPlaceCommand = defineCommand({
  name: 'request_place',
  v: 1,
  schema: requestPlacePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<{ requested: true }> => {
    await tx.query(
      `INSERT INTO saved_items (user_id, kind, ref_id, note) VALUES ($1, 'request', $2, $3)
       ON CONFLICT (user_id, kind, ref_id) DO NOTHING`,
      [ctx.uid, requestRefId(payload.query), payload.query],
    );
    return { requested: true };
  },
});
