/**
 * `act_inbox_item` (docs/api-contracts.md §4.3): runs one inline action of the caller's own inbox
 * item. An action that names a command runs that command's own authorize → entitle → handle in
 * this transaction under the same op_id, so the item, the notification action and the widget all
 * land in one idempotency namespace; then the item is settled. An item another surface already
 * settled answers `already_resolved` without acting twice.
 */
import { appendDomainEvent, outbox, type DbCommandResolver } from '@cp/db';
import {
  actInboxItemPayloadSchema,
  DomainError,
  inboxActionSchema,
  userChannel,
  type ActInboxItemResult,
} from '@cp/domain';
import { z } from 'zod';

import { defineCommand } from '../_framework/define-command';
import { publishBadgeCounts } from './shared';

interface ItemRow {
  id: string;
  kind: string;
  actions: unknown;
  expires_at: Date | null;
  undo_until: Date | null;
  resolved_at: Date | null;
}

export const ACT_INBOX_ITEM = 'act_inbox_item';

export function createActInboxItemCommand(resolve: DbCommandResolver) {
  return defineCommand({
    name: ACT_INBOX_ITEM,
    v: 1,
    schema: actInboxItemPayloadSchema,
    offline: true,
    allowAnonymous: true,
    actionScope: 'inbox',
    authorize: async (tx, payload) => {
      const { rows } = await tx.query('SELECT 1 FROM inbox_items WHERE id = $1', [payload.item_id]);
      if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'inbox_item' });
    },
    handle: async (tx, payload, ctx): Promise<ActInboxItemResult> => {
      const now = ctx.clock.serverNow;
      const { rows } = await tx.query<ItemRow>(
        `SELECT id, kind, actions, expires_at, undo_until, resolved_at
           FROM inbox_items WHERE id = $1 FOR UPDATE`,
        [payload.item_id],
      );
      const item = rows[0];
      if (item === undefined) throw new DomainError('NOT_FOUND', { reason: 'inbox_item' });
      if (item.resolved_at !== null) {
        return { item_id: item.id, action: payload.action, outcome: 'already_resolved' };
      }
      if (item.expires_at !== null && item.expires_at.getTime() <= now.getTime()) {
        throw new DomainError('STATE_INVALID', { state: 'expired' });
      }
      const actions = z.array(inboxActionSchema).catch([]).parse(item.actions);
      const action = actions.find((candidate) => candidate.id === payload.action);
      if (action === undefined) throw new DomainError('VALIDATION', { reason: 'unknown_action' });
      if (
        action.style === 'undo' &&
        (item.undo_until === null || item.undo_until.getTime() <= now.getTime())
      ) {
        throw new DomainError('STATE_INVALID', { state: 'undo_expired' });
      }

      let result: unknown;
      if (action.command !== undefined) {
        const target = resolve(action.command);
        if (target === undefined || target.internal || target.name === ACT_INBOX_ITEM) {
          throw new DomainError('VALIDATION', { reason: 'unknown_command' });
        }
        const targetPayload = target.schema.parse(action.payload ?? {});
        const targetCtx = { ...ctx, cmd: target.name };
        await target.authorize(tx, targetPayload, targetCtx);
        await target.entitle(tx, targetPayload, targetCtx);
        result = await target.handle(tx, targetPayload, targetCtx);
      }

      await tx.query(
        'UPDATE inbox_items SET resolved_at = $2, read_at = coalesce(read_at, $2) WHERE id = $1',
        [item.id, now],
      );
      await appendDomainEvent(tx, {
        type: 'inbox.item_resolved',
        aggregateKind: 'inbox_item',
        aggregateId: item.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { item_id: item.id, user_id: ctx.uid, kind: item.kind, action: action.id },
      });
      await outbox(tx, userChannel(ctx.uid), 'inbox.item_resolved', { item_id: item.id });
      await publishBadgeCounts(tx, ctx.uid, now);
      return {
        item_id: item.id,
        action: action.id,
        outcome: 'resolved',
        ...(result === undefined ? {} : { result }),
      };
    },
  });
}
