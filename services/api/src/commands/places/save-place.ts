/**
 * `save_place` / `unsave_place` (docs/api-contracts.md §4.3): ♡ SAVE keeps a destination (kind
 * `place`) or a place page's POI (kind `poi`) in the caller's saved items (synced on `me`),
 * optionally in one of their named lists (created on first use, so a save made offline needs no
 * list command first). Saving again is a no-op unless it names another list, which moves it.
 * `request_place` keeps a city nobody covers yet, asked for from an empty search, as the caller's
 * own request.
 */
import { createHash } from 'node:crypto';

import { appendDomainEvent } from '@cp/db';
import { DomainError, requestPlacePayloadSchema, savePlacePayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

/** `place` for a destination, `poi` for an active POI; anything else is not found. */
async function savedKind(tx: pg.PoolClient, placeId: string): Promise<'place' | 'poi'> {
  const { rows } = await tx.query<{ kind: 'place' | 'poi' }>(
    `SELECT 'place' AS kind FROM destinations WHERE id = $1
     UNION ALL SELECT 'poi' FROM pois WHERE id = $1 AND status = 'active'`,
    [placeId],
  );
  const kind = rows[0]?.kind;
  if (kind === undefined) throw new DomainError('NOT_FOUND', { reason: 'place' });
  return kind;
}

async function ensureList(tx: pg.PoolClient, uid: string, name: string): Promise<void> {
  await tx.query(
    `INSERT INTO saved_lists (user_id, name, position)
     SELECT $1, $2, coalesce(max(position) + 1, 0) FROM saved_lists WHERE user_id = $1
     ON CONFLICT (user_id, name) DO NOTHING`,
    [uid, name],
  );
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
  authorize: async (tx, payload) => {
    await savedKind(tx, payload.place_id);
  },
  handle: async (tx, payload, ctx): Promise<{ place_id: string; saved: true }> => {
    const kind = await savedKind(tx, payload.place_id);
    const list = payload.list_name ?? null;
    if (list !== null) await ensureList(tx, ctx.uid, list);
    const { rowCount } = await tx.query(
      `INSERT INTO saved_items (user_id, kind, ref_id, list_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, kind, ref_id) DO NOTHING`,
      [ctx.uid, kind, payload.place_id, list],
    );
    if ((rowCount ?? 0) > 0) {
      await appendDomainEvent(tx, placeEvent('place.saved', ctx.uid, payload.place_id));
    } else if (list !== null) {
      await tx.query(
        'UPDATE saved_items SET list_name = $4 WHERE user_id = $1 AND kind = $2 AND ref_id = $3',
        [ctx.uid, kind, payload.place_id, list],
      );
    }
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
      tx.query(
        "DELETE FROM saved_items WHERE user_id = $1 AND kind IN ('place', 'poi') AND ref_id = $2",
        [ctx.uid, payload.place_id],
      ),
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
