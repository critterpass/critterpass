/**
 * Chat older than what the phone keeps. Sync holds a crew's latest 1,000 messages; anything before
 * them is read a page at a time from `GET /v1/crews/{crew_id}/chat/messages` when the member
 * scrolls past the top, and held here in memory for as long as the chat screen is open. Nothing
 * fetched is written to the synced tables: closing the chat forgets it.
 *
 * Pages hold their reactions too, and a message kept after it left the phone keeps the reactions
 * it had. A reaction to, or the deletion of, a message outside the window never syncs back, so
 * what the member did is applied to the held copy at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, routes and wire values, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useSyncExternalStore } from 'react';

import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { fromRow, type ChatMessage, type MessageRow } from './rows';

/** How many messages the phone keeps per crew (the server's sync window). */
export const CHAT_SYNC_WINDOW = 1000;
/** How many older messages one request asks for (the route's most). */
export const OLDER_PAGE = 200;

/** A reaction on an older message, with the name the phone knows its author by. */
export interface OlderReaction {
  readonly message_id: string;
  readonly emoji: string;
  readonly user_id: string;
  readonly display_name: string | null;
}

/** The route's answer: rows as the phone stores synced rows. */
export interface ChatHistoryPage {
  readonly messages: readonly Omit<MessageRow, 'sender_name' | 'ref_name'>[];
  readonly reactions: readonly Omit<OlderReaction, 'display_name'>[];
  readonly has_more: boolean;
}

/** One page older than `beforeSeq`, or null when it could not be read (offline, refused). */
export type ChatHistoryApi = (
  crewId: string,
  beforeSeq: number,
  limit: number,
) => Promise<ChatHistoryPage | null>;

export const deviceChatHistoryApi: ChatHistoryApi = async (crewId, beforeSeq, limit) => {
  try {
    const query = `before_seq=${String(beforeSeq)}&limit=${String(limit)}`;
    const response = await fetch(
      `${resolveApiBaseUrl()}/v1/crews/${encodeURIComponent(crewId)}/chat/messages?${query}`,
      { headers: { accept: 'application/json', ...(await sessionHeaders()) } },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<ChatHistoryPage> | null;
    if (!Array.isArray(body?.messages) || !Array.isArray(body.reactions)) return null;
    return { messages: body.messages, reactions: body.reactions, has_more: body.has_more === true };
  } catch {
    return null;
  }
};

export type OlderStatus = 'idle' | 'loading' | 'failed';

export interface OlderMessages {
  /** Oldest first, every one below the phone's own rows. */
  readonly messages: readonly ChatMessage[];
  readonly reactions: readonly OlderReaction[];
  readonly status: OlderStatus;
  /** The server said nothing older is left. */
  readonly reachedStart: boolean;
}

const NONE: OlderMessages = { messages: [], reactions: [], status: 'idle', reachedStart: false };

const held = new Map<string, OlderMessages>();
const listeners = new Map<string, Set<() => void>>();

export function readOlder(crewId: string): OlderMessages {
  return held.get(crewId) ?? NONE;
}

function write(crewId: string, next: OlderMessages): void {
  held.set(crewId, next);
  for (const listener of listeners.get(crewId) ?? []) listener();
}

function subscribe(crewId: string, listener: () => void): () => void {
  const set = listeners.get(crewId) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(crewId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(crewId);
  };
}

/** The older messages held for a crew; changes identity only when they change. */
export function useOlderMessages(crewId: string): OlderMessages {
  return useSyncExternalStore(
    (listener) => subscribe(crewId, listener),
    () => readOlder(crewId),
    () => NONE,
  );
}

/** Closing the chat forgets what was fetched for it. */
export function forgetOlder(crewId: string): void {
  if (held.delete(crewId)) for (const listener of listeners.get(crewId) ?? []) listener();
}

/** Display names the phone has for these users and guides (a former member has none). */
async function namesOf(
  db: AbstractPowerSyncDatabase,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  if (ids.length === 0) return new Map();
  const marks = ids.map(() => '?').join(', ');
  const rows = await db.getAll<{ id: string; name: string | null }>(
    `SELECT id, display_name AS name FROM users WHERE id IN (${marks})
     UNION ALL SELECT id, name FROM guides WHERE id IN (${marks})`,
    [...ids, ...ids],
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}

function bySeq(a: ChatMessage, b: ChatMessage): number {
  return (a.seq ?? 0) - (b.seq ?? 0);
}

/** `messages` added to the held ones, one copy of each, oldest first. */
function merged(
  current: readonly ChatMessage[],
  messages: readonly ChatMessage[],
): readonly ChatMessage[] {
  const known = new Set(current.map((message) => message.id));
  const fresh = messages.filter((message) => !known.has(message.id));
  return fresh.length === 0 ? current : [...current, ...fresh].sort(bySeq);
}

/**
 * Fetches the page below `beforeSeq` and adds it to the held messages. A fetch already under way,
 * or a chat already read to its first message, does nothing; a page that cannot be read leaves
 * `failed` for the list to offer a retry.
 */
export async function fetchOlder(
  db: AbstractPowerSyncDatabase,
  crewId: string,
  beforeSeq: number,
  api: ChatHistoryApi = deviceChatHistoryApi,
): Promise<void> {
  const before = readOlder(crewId);
  if (before.status === 'loading' || before.reachedStart || beforeSeq <= 1) return;
  write(crewId, { ...before, status: 'loading' });
  const page = await api(crewId, beforeSeq, OLDER_PAGE).catch(() => null);
  // The chat closed while the page was on its way.
  if (!held.has(crewId)) return;
  if (page === null) {
    write(crewId, { ...readOlder(crewId), status: 'failed' });
    return;
  }
  const people = new Set<string>();
  for (const row of page.messages) {
    for (const id of [row.sender_id, row.guide_id, row.ref_id]) if (id !== null) people.add(id);
  }
  for (const row of page.reactions) people.add(row.user_id);
  const names = await namesOf(db, [...people]).catch(() => new Map<string, string | null>());
  if (!held.has(crewId)) return;
  const name = (id: string | null) => (id === null ? null : (names.get(id) ?? null));
  const current = readOlder(crewId);
  let messages: ChatMessage[];
  try {
    messages = page.messages.map((row) =>
      fromRow({
        ...row,
        sender_name: name(row.sender_id) ?? name(row.guide_id),
        ref_name: row.sender_kind === 'system' ? name(row.ref_id) : null,
      }),
    );
  } catch {
    // A page the app cannot read is a page not read: never a row left spinning.
    write(crewId, { ...current, status: 'failed' });
    return;
  }
  const ids = new Set(messages.map((message) => message.id));
  write(crewId, {
    messages: merged(current.messages, messages),
    reactions: [
      ...current.reactions.filter((reaction) => !ids.has(reaction.message_id)),
      ...page.reactions.map((row) => ({
        message_id: row.message_id,
        emoji: row.emoji,
        user_id: row.user_id,
        display_name: name(row.user_id),
      })),
    ],
    status: 'idle',
    reachedStart: !page.has_more,
  });
}

/** Every reaction the phone holds for the crew, in the shape a page carries its own. */
export function localReactions(
  db: AbstractPowerSyncDatabase,
  crewId: string,
): Promise<OlderReaction[]> {
  return db.getAll<OlderReaction>(
    `SELECT r.message_id, r.emoji, r.user_id, u.display_name
       FROM message_reactions r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.crew_id = ? ORDER BY r.created_at, r.id`,
    [crewId],
  );
}

/**
 * Messages the phone just let go of (a new message pushed them out of the window) while older
 * pages are on screen: they stay in the timeline, between those pages and the phone's own rows,
 * with the reactions they had (`reactions`: what the phone held before they left).
 */
export function keepOlder(
  crewId: string,
  messages: readonly ChatMessage[],
  reactions: readonly OlderReaction[] = [],
): void {
  const current = readOlder(crewId);
  const next = merged(current.messages, messages);
  if (next === current.messages) return;
  const known = new Set(current.messages.map((message) => message.id));
  const fresh = new Set(messages.map((message) => message.id).filter((id) => !known.has(id)));
  const theirs = reactions.filter((reaction) => fresh.has(reaction.message_id));
  write(crewId, {
    ...current,
    messages: next,
    reactions: theirs.length === 0 ? current.reactions : [...current.reactions, ...theirs],
  });
}

/** The member's own reaction to an older message, as they just set it. */
export function setOlderReaction(
  crewId: string,
  messageId: string,
  emoji: string,
  me: { readonly uid: string; readonly name: string | null },
  on: boolean,
): void {
  const current = readOlder(crewId);
  if (!current.messages.some((message) => message.id === messageId)) return;
  const rest = current.reactions.filter(
    (row) => !(row.message_id === messageId && row.emoji === emoji && row.user_id === me.uid),
  );
  const reactions = on
    ? [...rest, { message_id: messageId, emoji, user_id: me.uid, display_name: me.name }]
    : rest;
  write(crewId, { ...current, reactions });
}

/** An older message the member just deleted: it keeps its place, empty. */
export function setOlderDeleted(crewId: string, messageId: string): void {
  const current = readOlder(crewId);
  if (!current.messages.some((message) => message.id === messageId)) return;
  write(crewId, {
    ...current,
    messages: current.messages.map((message) =>
      message.id === messageId ? { ...message, body: '', attachments: [], deleted: true } : message,
    ),
  });
}
