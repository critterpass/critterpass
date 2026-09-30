/**
 * Crew chat pushes (`crew_chat`, a communication notification from the sender): who hears a new
 * message follows each member's per-crew level (`crew_members.notify_level`, mentions when never
 * chosen). `all` hears every message, `mentions` only messages that mention them or reply to one of
 * theirs, `off` nothing. The sender never hears their own message, and a member who muted the
 * sender hears nothing from them. Pushes collapse per crew and thread by crew; the `cp.chat`
 * category offers REPLY (sends through `send_message`) and READ (`mark_read` up to this `seq`).
 */
import type { MessageType } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';

export const CHAT_NOTIFICATION_KEY = 'crew_chat';
const PREVIEW_MAX = 160;

interface SentPayload {
  readonly crewId: string;
  readonly messageId: string;
  readonly seq: number;
  readonly type: MessageType;
  readonly senderId: string;
  readonly mentions: readonly string[];
  readonly replyToSenderId: string | null;
}

function sentPayload(event: RoutedEvent): SentPayload | null {
  const p = event.payload;
  if (typeof p['crew_id'] !== 'string' || typeof p['message_id'] !== 'string') return null;
  if (typeof p['sender_id'] !== 'string' || typeof p['seq'] !== 'number') return null;
  return {
    crewId: p['crew_id'],
    messageId: p['message_id'],
    seq: p['seq'],
    type: p['type'] as MessageType,
    senderId: p['sender_id'],
    mentions: Array.isArray(p['mentions']) ? (p['mentions'] as string[]) : [],
    replyToSenderId: typeof p['reply_to_sender_id'] === 'string' ? p['reply_to_sender_id'] : null,
  };
}

export type ChatNotifyLevel = 'all' | 'mentions' | 'off';

/** Whether a member at `level` hears a message; pure, so the level matrix is testable alone. */
export function hearsMessage(
  level: ChatNotifyLevel,
  uid: string,
  message: Pick<SentPayload, 'mentions' | 'replyToSenderId'>,
): boolean {
  if (level === 'off') return false;
  if (level === 'all') return true;
  return message.mentions.includes(uid) || message.replyToSenderId === uid;
}

/** Recipients of one sent message, in uid order. */
export async function chatAudience(tx: pg.PoolClient, event: RoutedEvent): Promise<string[]> {
  const message = sentPayload(event);
  if (message === null) return [];
  const { rows } = await tx.query<{ user_id: string; level: ChatNotifyLevel }>(
    `SELECT cm.user_id, coalesce(cm.notify_level, 'mentions') AS level
       FROM crew_members cm
       LEFT JOIN user_settings s ON s.user_id = cm.user_id
      WHERE cm.crew_id = $1 AND cm.status = 'active' AND cm.user_id <> $2
        AND NOT ($2 = ANY (coalesce(s.muted_uids, '{}')))
      ORDER BY cm.user_id`,
    [message.crewId, message.senderId],
  );
  return rows
    .filter((row) => hearsMessage(row.level, row.user_id, message))
    .map((row) => row.user_id);
}

/** The body template; message text goes in as a variable so it is never parsed as a template. */
function preview(type: MessageType): { id: string; message: string } {
  if (type === 'photo')
    return /*i18n*/ { id: 'notifications.crew_chat.photo', message: 'Sent a photo' };
  if (type === 'voice')
    return /*i18n*/ { id: 'notifications.crew_chat.voice', message: 'Sent a voice note' };
  return /*i18n*/ { id: 'notifications.crew_chat.text', message: '{text}' };
}

export function previewText(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX - 1)}…` : flat;
}

let registered = false;

export function registerChatNotifications(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: CHAT_NOTIFICATION_KEY,
    event: 'chat.message_sent',
    audience: chatAudience,
    async compose(tx, event) {
      const message = sentPayload(event);
      if (message === null) return null;
      const { rows } = await tx.query<{
        body: string;
        deleted: boolean;
        hidden: boolean;
        crew: string;
        sender: string | null;
        avatar: string | null;
      }>(
        `SELECT m.body, m.deleted_at IS NOT NULL AS deleted, m.hidden_at IS NOT NULL AS hidden,
                c.name AS crew, u.display_name AS sender,
                a.variant_keys->>'120' AS avatar
           FROM messages m
           JOIN crews c ON c.id = m.crew_id
           LEFT JOIN users u ON u.id = m.sender_id
           LEFT JOIN avatars a ON a.id = u.avatar_id AND a.moderation_status = 'approved'
          WHERE m.id = $1`,
        [message.messageId],
      );
      const row = rows[0];
      // Deleted or hidden before the push went out: nothing left to say.
      if (row === undefined || row.deleted || row.hidden) return null;
      const sender = row.sender?.trim().split(/\s+/)[0] ?? '';
      return {
        title: /*i18n*/ { id: 'notifications.crew_chat.title', message: '{sender} · {crew}' },
        body: preview(message.type),
        vars: { sender, crew: row.crew, text: previewText(row.body) },
        sender: {
          kind: 'member',
          id: message.senderId,
          name: sender,
          ...(row.avatar === null ? {} : { avatar: row.avatar }),
        },
        crewId: message.crewId,
        threadId: message.crewId,
        deepLink: `/crew/${message.crewId}/chat`,
        ctx: { crew_id: message.crewId, message_id: message.messageId, seq: message.seq },
        collapseVars: { crew_id: message.crewId },
      };
    },
  });
}
