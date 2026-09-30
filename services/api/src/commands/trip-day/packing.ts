/**
 * Packing commands (docs/api-contracts.md §4.12 `check_packing_item`, doc delta add/remove): any
 * participant ticks, adds or removes a shared row; a personal row is its owner's alone (the RLS
 * lookup hides it from everyone else). A shared tick reaches the crew on `trip_dayof:`; a personal
 * one never leaves its owner.
 */
import { appendDomainEvent } from '@cp/db';
import {
  addPackingItemPayloadSchema,
  checkPackingItemPayloadSchema,
  DomainError,
  removePackingItemPayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { publishDayOf, requireTripParticipant } from './shared';

interface PackingRow {
  readonly id: string;
  readonly trip_id: string;
  readonly owner_id: string | null;
}

/** The live row as the caller sees it, after the participant check. */
async function requirePackingItem(
  tx: pg.PoolClient,
  itemId: string,
  uid: string,
): Promise<PackingRow> {
  const { rows } = await tx.query<PackingRow>(
    'SELECT id, trip_id, owner_id FROM packing_items WHERE id = $1 AND deleted_at IS NULL',
    [itemId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'packing_item' });
  await requireTripParticipant(tx, row.trip_id, uid);
  return row;
}

export const checkPackingItemCommand = defineCommand({
  name: 'check_packing_item',
  v: 1,
  schema: checkPackingItemPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'trip_day',
  authorize: async (tx, payload, ctx) => {
    await requirePackingItem(tx, payload.item_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const item = await requirePackingItem(tx, payload.item_id, ctx.uid);
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query(
        `UPDATE packing_items
            SET checked = $2, checked_by = CASE WHEN $2 THEN $3::uuid END,
                checked_at = CASE WHEN $2 THEN $4::timestamptz END, version = version + 1
          WHERE id = $1 AND checked IS DISTINCT FROM $2
          RETURNING id`,
        [item.id, payload.checked, ctx.uid, ctx.clock.serverNow],
      );
      if (rows.length > 0) {
        await appendDomainEvent(tx, {
          type: 'packing.checked',
          aggregateKind: 'packing_item',
          aggregateId: item.id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: item.trip_id,
          payload: {
            trip_id: item.trip_id,
            item_id: item.id,
            user_id: ctx.uid,
            checked: payload.checked,
          },
        });
        if (item.owner_id === null) {
          await publishDayOf(tx, item.trip_id, 'packing.checked', {
            item_id: item.id,
            checked: payload.checked,
            by: ctx.uid,
          });
        }
      }
      return { item_id: item.id, checked: payload.checked };
    });
  },
});

export const addPackingItemCommand = defineCommand({
  name: 'add_packing_item',
  v: 1,
  schema: addPackingItemPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireTripParticipant(tx, payload.trip_id, ctx.uid),
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ trip_id: string; owner_id: string | null }>(
        `INSERT INTO packing_items (id, trip_id, day, owner_id, label, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING RETURNING trip_id, owner_id`,
        [
          payload.item_id,
          payload.trip_id,
          payload.day ?? null,
          payload.personal ? ctx.uid : null,
          payload.label,
          ctx.uid,
        ],
      );
      if (rows.length === 0) {
        const existing = await tx.query<{ created_by: string | null }>(
          'SELECT created_by FROM packing_items WHERE id = $1',
          [payload.item_id],
        );
        if (existing.rows[0]?.created_by !== ctx.uid) {
          throw new DomainError('STATE_INVALID', { reason: 'item_id_taken' });
        }
      }
      return { item_id: payload.item_id, personal: payload.personal };
    }),
});

export const removePackingItemCommand = defineCommand({
  name: 'remove_packing_item',
  v: 1,
  schema: removePackingItemPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requirePackingItem(tx, payload.item_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const item = await requirePackingItem(tx, payload.item_id, ctx.uid);
    await asSystemRole(tx, () =>
      tx.query('UPDATE packing_items SET deleted_at = $2, version = version + 1 WHERE id = $1', [
        item.id,
        ctx.clock.serverNow,
      ]),
    );
    return { item_id: item.id, removed: true };
  },
});
