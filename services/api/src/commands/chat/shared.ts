/**
 * Helpers the chat handlers share: the message a command acts on (as the caller, so RLS decides
 * what exists), mention and attachment checks, the edit window from config and the realtime hint
 * every change sends on `crew_chat:{crew_id}`.
 */
import { outbox } from '@cp/db';
import {
  CHAT_EDIT_WINDOW_MINUTES,
  channelName,
  DomainError,
  type OutgoingAttachment,
  type StoredAttachment,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { parseMediaKey } from '../../media/purposes';

export interface ChatMessageRow {
  readonly id: string;
  readonly crew_id: string;
  readonly sender_kind: 'user' | 'guide' | 'system';
  readonly sender_id: string | null;
  readonly type: string;
  readonly created_at: Date;
  readonly deleted_at: Date | null;
}

/** The message as the caller sees it, or `NOT_FOUND` (hidden, foreign or unknown alike). */
export async function visibleMessage(
  tx: pg.PoolClient,
  messageId: string,
): Promise<ChatMessageRow> {
  const { rows } = await tx.query<ChatMessageRow>(
    `SELECT id, crew_id, sender_kind, sender_id, type, created_at, deleted_at
       FROM messages WHERE id = $1`,
    [messageId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'message' });
  return row;
}

/** The caller must be an active member (former members who kept the chat read, never write). */
export async function requireChatWriter(tx: pg.PoolClient, crewId: string): Promise<void> {
  const { rows } = await tx.query<{ writer: boolean; reader: boolean }>(
    'SELECT app.is_crew_member($1) AS writer, app.is_crew_chat_member($1) AS reader',
    [crewId],
  );
  const access = rows[0];
  if (access?.writer === true) return;
  if (access?.reader === true) throw new DomainError('FORBIDDEN', { reason: 'read_only' });
  throw new DomainError('NOT_FOUND', { reason: 'crew' });
}

/** Every mentioned uid must be an active member of the crew. */
export async function assertMentionsAreMembers(
  tx: pg.PoolClient,
  crewId: string,
  mentions: readonly string[],
): Promise<void> {
  if (mentions.length === 0) return;
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(DISTINCT user_id)::int AS n FROM crew_members
      WHERE crew_id = $1 AND status = 'active' AND user_id = ANY($2::uuid[])`,
    [crewId, [...new Set(mentions)]],
  );
  if ((rows[0]?.n ?? 0) !== new Set(mentions).size) {
    throw new DomainError('VALIDATION', { reason: 'mention_not_member' });
  }
}

const PURPOSE_FOR_KIND = { photo: 'photo', voice: 'voice' } as const;

/**
 * Resolves each outgoing attachment to the sender's own registered media object. A key the sender
 * did not upload, or one uploaded for another purpose, is refused as not found.
 */
export async function resolveAttachments(
  tx: pg.PoolClient,
  uid: string,
  attachments: readonly OutgoingAttachment[],
): Promise<StoredAttachment[]> {
  if (attachments.length === 0) return [];
  for (const attachment of attachments) {
    const parsed = parseMediaKey(attachment.media_key);
    if (parsed?.ownerId !== uid || parsed.purpose !== PURPOSE_FOR_KIND[attachment.kind]) {
      throw new DomainError('NOT_FOUND', { reason: 'attachment' });
    }
  }
  const keys = attachments.map((attachment) => attachment.media_key);
  const found = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ id: string; r2_key: string }>(
      'SELECT id, r2_key FROM media_objects WHERE owner_id = $1 AND r2_key = ANY($2::text[])',
      [uid, keys],
    );
    return new Map(rows.map((row) => [row.r2_key, row.id]));
  });
  return attachments.map((attachment) => {
    const mediaId = found.get(attachment.media_key);
    if (mediaId === undefined) throw new DomainError('NOT_FOUND', { reason: 'attachment' });
    return {
      media_id: mediaId,
      media_key: attachment.media_key,
      kind: attachment.kind,
      w: attachment.w ?? null,
      h: attachment.h ?? null,
      duration_ms: attachment.duration_ms ?? null,
      derived_key: null,
      ...(attachment.peaks === undefined ? {} : { peaks: attachment.peaks }),
    };
  });
}

/** `chat.edit_window_minutes` from the public config, else 15. */
export async function editWindowMinutes(tx: pg.PoolClient): Promise<number> {
  const { rows } = await tx.query<{ value: unknown }>(
    "SELECT value FROM client_config WHERE key = 'chat.edit_window_minutes'",
  );
  const value = rows[0]?.value;
  return typeof value === 'number' && value > 0 ? value : CHAT_EDIT_WINDOW_MINUTES;
}

export function chatChannel(crewId: string): string {
  return channelName('crew_chat', crewId);
}

/** Realtime hint: clients pull the row through sync. */
export async function hintChat(
  tx: pg.PoolClient,
  crewId: string,
  type: 'message.created' | 'message.edited' | 'message.deleted' | 'reaction',
  data: Readonly<Record<string, unknown>>,
): Promise<void> {
  await outbox(tx, chatChannel(crewId), type, { crew_id: crewId, ...data });
}
