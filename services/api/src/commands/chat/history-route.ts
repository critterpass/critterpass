/**
 * `GET /v1/crews/{crew_id}/chat/messages?before_seq&limit` (docs/api-contracts.md §5): one page of
 * a crew's chat older than `before_seq`, for the app's scroll past the 1,000 messages a phone keeps
 * (docs/data-model-sync-and-privacy.md §4). It reads as the caller, so RLS decides exactly what the
 * `crew_chat` stream would: active members and former members who kept the chat, never a row
 * moderation hid. Rows come in the shape the phone stores synced rows (text and integers, lists
 * and jsonb as JSON text), with the reactions on the page's messages.
 */
import { withUser } from '@cp/db';
import { DomainError, generateUuidV7 } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';
import { requireCommandSession, type SessionResolver } from '../_framework/session';

/** The most messages one page holds. */
export const CHAT_HISTORY_PAGE_MAX = 200;

/** A `messages` row as a phone stores it. */
export interface SyncedMessageRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly seq: number;
  readonly sender_kind: 'user' | 'guide' | 'system';
  readonly sender_id: string | null;
  readonly guide_id: string | null;
  readonly type: string;
  readonly body: string;
  readonly ref_kind: string | null;
  readonly ref_id: string | null;
  readonly reply_to_id: string | null;
  readonly mentions: string;
  readonly mentions_guide: number;
  readonly attachments: string;
  readonly edited_at: string | null;
  readonly deleted_at: string | null;
  readonly hidden_at: string | null;
  readonly in_sync_window: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/** A `message_reactions` row as a phone stores it. */
export interface SyncedReactionRow {
  readonly id: string;
  readonly message_id: string;
  readonly crew_id: string;
  readonly user_id: string;
  readonly emoji: string;
  readonly in_sync_window: number;
  readonly created_at: string;
}

export interface ChatHistoryPage {
  /** Newest first, every `seq` below `before_seq`. */
  readonly messages: readonly SyncedMessageRow[];
  readonly reactions: readonly SyncedReactionRow[];
  /** Older messages remain below this page. */
  readonly has_more: boolean;
}

/** A timestamp as sync writes it: ISO 8601, UTC, microseconds. */
const instant = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${column}`;

const MESSAGE_COLUMNS = `id, crew_id, trip_id, seq::float8 AS seq, sender_kind, sender_id, guide_id,
  type, body, ref_kind, ref_id, reply_to_id, array_to_json(mentions)::text AS mentions,
  mentions_guide::int AS mentions_guide, attachments::text AS attachments,
  ${instant('edited_at')}, ${instant('deleted_at')}, ${instant('hidden_at')},
  in_sync_window::int AS in_sync_window, ${instant('created_at')}, ${instant('updated_at')}`;

const REACTION_COLUMNS = `id, message_id, crew_id, user_id, emoji,
  in_sync_window::int AS in_sync_window, ${instant('created_at')}`;

export async function loadChatHistoryPage(
  pool: pg.Pool,
  uid: string,
  crewId: string,
  beforeSeq: number,
  limit: number,
): Promise<ChatHistoryPage> {
  return withUser(pool, uid, generateUuidV7(), async (tx) => {
    const access = await tx.query<{ reader: boolean }>(
      'SELECT app.is_crew_chat_member($1) AS reader',
      [crewId],
    );
    if (access.rows[0]?.reader !== true) throw new DomainError('NOT_FOUND', { reason: 'crew' });
    const { rows } = await tx.query<SyncedMessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages
        WHERE crew_id = $1 AND seq < $2 ORDER BY seq DESC LIMIT $3`,
      [crewId, beforeSeq, limit + 1],
    );
    const messages = rows.slice(0, limit);
    const reactions =
      messages.length === 0
        ? []
        : (
            await tx.query<SyncedReactionRow>(
              `SELECT ${REACTION_COLUMNS} FROM message_reactions
                WHERE message_id = ANY($1::uuid[]) ORDER BY created_at, id`,
              [messages.map((message) => message.id)],
            )
          ).rows;
    return { messages, reactions, has_more: rows.length > limit };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WHOLE = /^[0-9]{1,15}$/;

function wholeNumber(value: string | undefined, field: string, min: number, max: number): number {
  const parsed = value !== undefined && WHOLE.test(value) ? Number(value) : Number.NaN;
  if (!(parsed >= min && parsed <= max)) throw new DomainError('VALIDATION', { reason: field });
  return parsed;
}

export function registerChatHistoryRoute(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly pool: pg.Pool; readonly sessions: SessionResolver },
): void {
  app.get('/v1/crews/:crewId/chat/messages', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const crewId = c.req.param('crewId');
    if (!UUID.test(crewId)) throw new DomainError('NOT_FOUND', { reason: 'crew' });
    const beforeSeq = wholeNumber(c.req.query('before_seq'), 'before_seq', 1, 1e15);
    const limit = wholeNumber(
      c.req.query('limit') ?? String(CHAT_HISTORY_PAGE_MAX),
      'limit',
      1,
      CHAT_HISTORY_PAGE_MAX,
    );
    c.header('Cache-Control', 'no-store');
    return c.json(await loadChatHistoryPage(deps.pool, session.uid, crewId, beforeSeq, limit));
  });
}
