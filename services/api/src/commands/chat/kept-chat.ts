/**
 * A former member who kept the crew chat (read-only) can ask to be let back in or drop the chat.
 *
 * `ask_to_rejoin` posts a "would like to rejoin" line in the crew chat for the organisers, at most
 * once a day; coming back is still an invite the organiser sends. `remove_kept_chat` turns off the
 * member's own keep-in-chat, so the chat stops syncing to their phones; the crew keeps the history.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, keptChatPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

/** Only someone reading the chat without being a member: a former member who kept it. */
async function requireKeptReader(tx: pg.PoolClient, crewId: string): Promise<void> {
  const { rows } = await tx.query<{ writer: boolean; reader: boolean }>(
    'SELECT app.is_crew_member($1) AS writer, app.is_crew_chat_member($1) AS reader',
    [crewId],
  );
  const access = rows[0];
  if (access?.writer === true) throw new DomainError('STATE_INVALID', { state: 'member' });
  if (access?.reader !== true) throw new DomainError('NOT_FOUND', { reason: 'crew' });
}

const ASK_AGAIN_AFTER_HOURS = 24;

export const askToRejoinCommand = defineCommand({
  name: 'ask_to_rejoin',
  v: 1,
  schema: keptChatPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireKeptReader(tx, payload.crew_id);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rowCount } = await tx.query(
        `SELECT 1 FROM messages
          WHERE crew_id = $1 AND type = 'system' AND ref_kind = 'rejoin_asked' AND ref_id = $2
            AND created_at > now() - make_interval(hours => $3)`,
        [payload.crew_id, ctx.uid, ASK_AGAIN_AFTER_HOURS],
      );
      if ((rowCount ?? 0) > 0) return { crew_id: payload.crew_id, asked: false };
      await tx.query("SELECT app.post_crew_system_message($1, 'rejoin_asked', $2, '')", [
        payload.crew_id,
        ctx.uid,
      ]);
      return { crew_id: payload.crew_id, asked: true };
    }),
});

export const removeKeptChatCommand = defineCommand({
  name: 'remove_kept_chat',
  v: 1,
  schema: keptChatPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireKeptReader(tx, payload.crew_id);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE crew_members SET keep_in_chat = false
          WHERE crew_id = $1 AND user_id = $2 AND status = 'former'`,
        [payload.crew_id, ctx.uid],
      );
      await appendDomainEvent(tx, {
        type: 'crew.member_updated',
        aggregateKind: 'crew',
        aggregateId: payload.crew_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { crew_id: payload.crew_id, user_id: ctx.uid, keep_in_chat: false },
        crewId: payload.crew_id,
        tripId: null,
      });
      return { crew_id: payload.crew_id };
    }),
});
