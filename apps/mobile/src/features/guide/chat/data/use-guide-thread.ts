/**
 * The sheet's thread and its saved messages. GROUP is the trip's one crew-visible thread; JUST ME
 * is the asker's private thread for the trip (or the home guide's, with no trip). A mode with no
 * thread yet gets a fresh client id; the server opens the thread on its first question.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { generateUuidV7, type GuideThreadMode } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveQuery } from './live-rows';

export interface GuideCardRef {
  readonly kind: 'proposal';
  readonly changesetId: string;
}

export interface SavedGuideMessage {
  readonly id: string;
  readonly role: 'user' | 'guide';
  readonly authorId: string | null;
  readonly text: string;
  readonly proposals: readonly string[];
  readonly sources: readonly string[];
  readonly rating: string | null;
  readonly createdAt: string;
}

interface ThreadRow {
  readonly id: string;
}

interface MessageRow {
  readonly id: string;
  readonly role: string;
  readonly author_id: string | null;
  readonly content: string | null;
  readonly cards: string | null;
  readonly sources: string | null;
  readonly rating: string | null;
  readonly created_at: string;
}

function parseArray(value: string | null): unknown[] {
  if (value === null) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toSavedMessage(row: MessageRow): SavedGuideMessage {
  const proposals = parseArray(row.cards).flatMap((card) => {
    const c = card as { kind?: unknown; changeset_id?: unknown };
    return c.kind === 'proposal' && typeof c.changeset_id === 'string' ? [c.changeset_id] : [];
  });
  const sources = parseArray(row.sources).flatMap((source) => {
    const url = (source as { url?: unknown }).url;
    return typeof url === 'string' ? [url] : [];
  });
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'guide',
    authorId: row.author_id,
    text: row.content ?? '',
    proposals,
    sources,
    rating: row.rating,
    createdAt: row.created_at,
  };
}

const THREAD_SQL = `SELECT id FROM guide_threads
  WHERE mode = ?1 AND trip_id IS ?2 AND (?1 = 'group' OR user_id = ?3)
  ORDER BY created_at LIMIT 1`;

const MESSAGES_SQL = `SELECT id, role, author_id, content, cards, sources, rating, created_at
  FROM guide_messages WHERE thread_id = ? ORDER BY created_at, id`;

export interface GuideThreadView {
  readonly threadId: string;
  /** Whether the server already has this thread (it has synced down). */
  readonly exists: boolean;
  readonly messages: readonly SavedGuideMessage[];
  readonly loading: boolean;
}

export function useGuideThread(
  mode: GuideThreadMode,
  tripId: string | null,
  uid: string | null,
): GuideThreadView {
  const threads = useLiveQuery<ThreadRow>(
    uid === null ? null : THREAD_SQL,
    [mode, tripId, uid],
    ['guide_threads'],
  );
  // A new id per mode and trip, kept while the sheet is open.
  const fresh = useMemo(() => generateUuidV7(), [mode, tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  const existing = threads?.[0]?.id ?? null;
  const threadId = existing ?? fresh;
  const rows = useLiveQuery<MessageRow>(MESSAGES_SQL, [threadId], ['guide_messages']);
  const messages = useMemo(() => (rows ?? []).map(toSavedMessage), [rows]);
  return { threadId, exists: existing !== null, messages, loading: threads === null };
}

const TARGET_SQL = 'SELECT mode, trip_id FROM guide_threads WHERE id = ?';

/** A thread named by id (a push, the inbox): its trip and mode, once it has synced. */
export function useThreadTarget(
  threadId: string | null,
): { readonly tripId: string | null; readonly mode: GuideThreadMode } | null {
  const rows = useLiveQuery<{ mode: GuideThreadMode; trip_id: string | null }>(
    threadId === null ? null : TARGET_SQL,
    [threadId],
    ['guide_threads'],
  );
  const row = rows?.[0];
  return row === undefined ? null : { tripId: row.trip_id, mode: row.mode };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value);
}
