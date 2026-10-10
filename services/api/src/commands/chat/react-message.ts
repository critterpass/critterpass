/**
 * `react_message` (docs/api-contracts.md §4.2): a member puts an emoji or a critter (`c112.cheer`,
 * any critter of the published dex) on a message or takes it back. `on` states the outcome the app showed; without it the reaction toggles. Taking one back
 * goes through `app.remove_message_reaction` (app_user deletes nothing directly).
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  parseCritterReaction,
  reactMessagePayloadSchema,
  type ReactMessageResult,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { hintChat, requireChatWriter, visibleMessage } from './shared';

async function assertCritterExists(tx: pg.PoolClient, no: number): Promise<void> {
  const { rowCount } = await tx.query('SELECT 1 FROM critters WHERE no = $1', [no]);
  if (rowCount === 0) throw new DomainError('VALIDATION', { reason: 'unknown_critter' });
}

export const reactMessageCommand = defineCommand({
  name: 'react_message',
  v: 1,
  schema: reactMessagePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const message = await visibleMessage(tx, payload.message_id);
    await requireChatWriter(tx, message.crew_id);
  },
  handle: async (tx, payload, ctx): Promise<ReactMessageResult> => {
    const message = await visibleMessage(tx, payload.message_id);
    if (message.deleted_at !== null) {
      throw new DomainError('STATE_INVALID', { reason: 'message_deleted' });
    }
    const { rows } = await tx.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM message_reactions
                       WHERE message_id = $1 AND user_id = $2 AND emoji = $3) AS exists`,
      [payload.message_id, ctx.uid, payload.emoji],
    );
    const had = rows[0]?.exists === true;
    const on = payload.on ?? !had;
    const critter = parseCritterReaction(payload.emoji);
    if (on && !had && critter !== null) await assertCritterExists(tx, critter.no);
    if (on && !had) {
      await tx.query(
        'INSERT INTO message_reactions (message_id, crew_id, user_id, emoji) VALUES ($1, $2, $3, $4)',
        [payload.message_id, message.crew_id, ctx.uid, payload.emoji],
      );
    } else if (!on && had) {
      await tx.query('SELECT app.remove_message_reaction($1, $2)', [
        payload.message_id,
        payload.emoji,
      ]);
    }
    if (on !== had) {
      await appendDomainEvent(tx, {
        type: 'chat.reaction_changed',
        aggregateKind: 'message',
        aggregateId: payload.message_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          crew_id: message.crew_id,
          message_id: payload.message_id,
          user_id: ctx.uid,
          added: on,
        },
        crewId: message.crew_id,
      });
      await hintChat(tx, message.crew_id, 'reaction', { message_id: payload.message_id });
    }
    return { message_id: payload.message_id, emoji: payload.emoji, on };
  },
});
