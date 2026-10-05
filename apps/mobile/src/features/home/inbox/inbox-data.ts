/**
 * The inbox's local reads: the caller's items with the actor's name and crew colour slot, minus
 * the ones whose answer is still in the upload queue (they are already on their way out). Split
 * into needs-you cards (open, newest first; one that expires while on screen stays as "closed"
 * until the user leaves) and the quiet EARLIER list, paged 50 at a time. An item the server settles
 * by itself once the thing is done (a proposal answered, placed ideas reviewed) only opens when
 * tapped: it stays under "needs you" until then.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { inboxActionSchema, type InboxAction } from '@cp/domain';

import { PENDING_ACTS } from '../data/home-queries';
import { useLiveRows } from '../data/watch-query';

export const EARLIER_PAGE = 50;

export const INBOX_SQL = `SELECT i.id, i.kind, i.source, i.actor_id, u.display_name AS actor_name,
    (SELECT count(*) FROM crew_members o
      WHERE o.crew_id = i.crew_id AND o.created_at < m.created_at) AS actor_join_index,
    i.crew_id, c.name AS crew_name, i.data, i.needs_you, i.actions, i.deep_link, i.expires_at,
    i.undo_until, i.resolved_at, i.read_at, i.created_at, i.resolve_key,
    (SELECT g.slug FROM trips t JOIN guides g ON g.id = t.guide_id WHERE t.id = i.trip_id)
      AS trip_guide
  FROM inbox_items i
  LEFT JOIN users u ON u.id = i.actor_id
  LEFT JOIN crews c ON c.id = i.crew_id
  LEFT JOIN crew_members m ON m.crew_id = i.crew_id AND m.user_id = i.actor_id
  WHERE i.user_id = ? AND i.id NOT IN (${PENDING_ACTS})
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT ?`;
export const INBOX_TABLES = [
  'inbox_items',
  'users',
  'crews',
  'crew_members',
  'commands',
  'trips',
  'guides',
];

export interface InboxRow {
  readonly id: string;
  readonly kind: string;
  readonly source: string | null;
  readonly actor_id: string | null;
  readonly actor_name: string | null;
  readonly actor_join_index: number | null;
  readonly crew_id: string | null;
  readonly crew_name: string | null;
  readonly data: string | null;
  readonly needs_you: number | null;
  readonly actions: string | null;
  readonly deep_link: string | null;
  readonly expires_at: string | null;
  readonly undo_until: string | null;
  readonly resolved_at: string | null;
  readonly read_at: string | null;
  readonly created_at: string;
  readonly resolve_key?: string | null;
  /** The guide of the item's trip, for items that name no guide of their own. */
  readonly trip_guide?: string | null;
}

export type InboxSource = 'crew' | 'guide' | 'system';

export interface InboxItem {
  readonly id: string;
  readonly kind: string;
  readonly source: InboxSource;
  readonly actorId: string | null;
  readonly actorName: string;
  readonly actorJoinIndex: number;
  readonly crewId: string | null;
  readonly crewName: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly needsYou: boolean;
  readonly actions: readonly InboxAction[];
  readonly deepLink: string | null;
  readonly expiresAt: Date | null;
  readonly undoUntil: Date | null;
  readonly resolved: boolean;
  readonly read: boolean;
  readonly createdAt: Date;
  /** The server settles the item itself when the thing it asks about is done. */
  readonly settlesItself: boolean;
}

function parseActions(value: unknown): InboxAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const parsed = inboxActionSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseData(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJson(value: string | null): unknown {
  if (value === null || value === '') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Timestamps arrive as `YYYY-MM-DD HH:MM:SS[.ffff]Z` or ISO; both parse once the space is a T. */
export function parseInstant(value: string | null): Date | null {
  if (value === null || value === '') return null;
  const at = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(at.getTime()) ? null : at;
}

export function toInboxItem(row: InboxRow): InboxItem {
  const source = row.source === 'crew' || row.source === 'guide' ? row.source : 'system';
  const data = parseData(parseJson(row.data));
  return {
    id: row.id,
    kind: row.kind,
    source,
    actorId: row.actor_id,
    actorName: row.actor_name?.trim().split(/\s+/u)[0] ?? '',
    actorJoinIndex: Number(row.actor_join_index ?? 0),
    crewId: row.crew_id,
    crewName: row.crew_name ?? '',
    // The trip's own guide speaks for an item that names none.
    data:
      data['guide'] === undefined && row.trip_guide != null
        ? { ...data, guide: row.trip_guide }
        : data,
    needsYou: Number(row.needs_you ?? 0) === 1,
    actions: parseActions(parseJson(row.actions)),
    deepLink: row.deep_link,
    expiresAt: parseInstant(row.expires_at),
    undoUntil: parseInstant(row.undo_until),
    resolved: row.resolved_at !== null,
    read: row.read_at !== null,
    createdAt: parseInstant(row.created_at) ?? new Date(0),
    settlesItself: row.resolve_key != null && row.resolve_key !== '',
  };
}

/**
 * Tapping this action only opens the item's screen. The item stays under "needs you" until the
 * thing it asks about is done there (the server settles it then), so a proposal read but not
 * answered still needs the reader.
 */
export function opensWithoutSettling(item: InboxItem, action: InboxAction): boolean {
  return (
    action.command === undefined &&
    action.style !== 'undo' &&
    item.deepLink !== null &&
    item.settlesItself
  );
}

export function isExpired(item: InboxItem, now: Date): boolean {
  return item.expiresAt !== null && item.expiresAt.getTime() <= now.getTime();
}

export interface InboxLists {
  /** Open needs-you items, newest first. */
  readonly cards: readonly InboxItem[];
  /** Everything else, newest first. */
  readonly earlier: readonly InboxItem[];
  readonly needsYou: number;
  /** More rows exist than were read. */
  readonly more: boolean;
}

/** A card that expired this recently stays on top, shown closed, rather than vanishing. */
export const CLOSED_CARD_MS = 60 * 60 * 1000;

function closedRecently(item: InboxItem, now: Date): boolean {
  return item.expiresAt !== null && now.getTime() - item.expiresAt.getTime() < CLOSED_CARD_MS;
}

/**
 * Splits rows into cards and EARLIER. A card that expired within the last hour stays a card (shown
 * closed) rather than disappearing from under the user's thumb; older expired ones drop out.
 */
export function splitInbox(items: readonly InboxItem[], now: Date, limit: number): InboxLists {
  const cards: InboxItem[] = [];
  const earlier: InboxItem[] = [];
  for (const item of items) {
    const open = item.needsYou && !item.resolved;
    if (open && (!isExpired(item, now) || closedRecently(item, now))) cards.push(item);
    else if (!open || !isExpired(item, now)) earlier.push(item);
  }
  return {
    cards,
    earlier,
    needsYou: cards.filter((item) => !isExpired(item, now)).length,
    more: items.length >= limit,
  };
}

export function useInboxItems(uid: string | null, limit: number) {
  const { rows, loaded } = useLiveRows<InboxRow>(
    INBOX_SQL,
    uid === null ? null : [uid, limit],
    INBOX_TABLES,
  );
  return { items: rows.map(toInboxItem), loaded };
}
