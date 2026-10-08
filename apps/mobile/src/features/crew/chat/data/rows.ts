/**
 * Row shapes and parsers for the synced chat tables. PowerSync replicates Postgres arrays and jsonb
 * as JSON text (an older replica may hold a `{a,b}` array literal), so every list column is parsed
 * defensively: a value the app cannot read becomes an empty list, never a crash.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { MessageType, StoredAttachment } from '@cp/domain';
import { memberName } from '@/ui/people/member-name';

const UUID = /^[0-9a-f-]{36}$/iu;

/** watchRows takes no parameters: ids are checked uuids before they are inlined. */
export function quoted(id: string): string {
  if (!UUID.test(id)) throw new Error(`not a uuid: ${id}`);
  return `'${id}'`;
}

export function parseList(value: string | null | undefined): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (value.startsWith('{')) {
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((item) => item.replace(/^"|"$/gu, ''));
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function parseAttachments(value: string | null | undefined): StoredAttachment[] {
  if (value === null || value === undefined || value === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is StoredAttachment =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as StoredAttachment).media_key === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

/** A `messages` row as synced (every value text or integer). */
export interface MessageRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly seq: number;
  readonly sender_kind: 'user' | 'guide' | 'system';
  readonly sender_id: string | null;
  readonly guide_id: string | null;
  readonly type: MessageType;
  readonly body: string | null;
  readonly ref_kind: string | null;
  readonly ref_id: string | null;
  readonly reply_to_id: string | null;
  readonly mentions: string | null;
  readonly mentions_guide: number | null;
  readonly attachments: string | null;
  readonly edited_at: string | null;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly sender_name: string | null;
  /** Display name of the member a system row is about. */
  readonly ref_name: string | null;
}

/** Where a message stands on this device. */
export type DeliveryStatus = 'sent' | 'sending' | 'uploaded' | 'failed';

export interface ChatMessage {
  readonly id: string;
  readonly crewId: string;
  /** The trip a card's message belongs to; a message built without its row carries none. */
  readonly tripId?: string | null;
  /** Null until the server has numbered it (a local send). */
  readonly seq: number | null;
  readonly senderKind: 'user' | 'guide' | 'system';
  readonly senderId: string | null;
  readonly senderName: string | null;
  /** System rows: the member the row is about. */
  readonly refName?: string | null;
  readonly guideId: string | null;
  readonly type: MessageType;
  readonly body: string;
  readonly refKind: string | null;
  readonly refId: string | null;
  readonly replyToId: string | null;
  readonly mentions: readonly string[];
  readonly mentionsGuide: boolean;
  readonly attachments: readonly StoredAttachment[];
  readonly edited: boolean;
  readonly deleted: boolean;
  /** Server time for synced rows, device time for local sends (display only, never order). */
  readonly createdAt: string;
  readonly status: DeliveryStatus;
  /** The refusal code of a failed send (`errors.<code>`). */
  readonly failureCode?: string;
}

export function fromRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    crewId: row.crew_id,
    tripId: row.trip_id ?? null,
    seq: Number(row.seq),
    senderKind: row.sender_kind,
    senderId: row.sender_id,
    // Someone whose account was erased keeps their messages' place under "Former member".
    senderName:
      row.sender_kind === 'user' && row.sender_id !== null
        ? memberName(row.sender_name)
        : row.sender_name,
    refName: row.ref_name,
    guideId: row.guide_id,
    type: row.type,
    body: row.body ?? '',
    refKind: row.ref_kind,
    refId: row.ref_id,
    replyToId: row.reply_to_id,
    mentions: parseList(row.mentions),
    mentionsGuide: row.mentions_guide === 1,
    attachments: parseAttachments(row.attachments),
    edited: row.edited_at !== null,
    deleted: row.deleted_at !== null,
    createdAt: row.created_at,
    status: 'sent',
  };
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.length === 0 || JSON.stringify(a) === JSON.stringify(b);
}

/** Two reads of one message that show the same thing. */
export function sameMessage(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.id === b.id &&
    (a.tripId ?? null) === (b.tripId ?? null) &&
    a.seq === b.seq &&
    a.status === b.status &&
    a.body === b.body &&
    a.edited === b.edited &&
    a.deleted === b.deleted &&
    a.senderName === b.senderName &&
    a.refName === b.refName &&
    a.createdAt === b.createdAt &&
    a.type === b.type &&
    a.senderKind === b.senderKind &&
    a.senderId === b.senderId &&
    a.guideId === b.guideId &&
    a.refKind === b.refKind &&
    a.refId === b.refId &&
    a.replyToId === b.replyToId &&
    a.mentionsGuide === b.mentionsGuide &&
    a.failureCode === b.failureCode &&
    sameList(a.mentions, b.mentions) &&
    sameList(a.attachments, b.attachments)
  );
}

/**
 * `next` with every message that reads the same as before swapped for the object already held, so
 * a memoised row whose message did not change is not drawn again. When nothing changed at all the
 * previous list itself comes back.
 */
export function keepUnchanged(
  previous: readonly ChatMessage[],
  next: readonly ChatMessage[],
): readonly ChatMessage[] {
  if (previous.length === 0) return next;
  const held = new Map(previous.map((message) => [message.id, message]));
  let changed = previous.length !== next.length;
  const kept = next.map((message, index) => {
    const before = held.get(message.id);
    const same = before !== undefined && sameMessage(before, message);
    if (!same || previous[index] !== before) changed = true;
    return same ? before : message;
  });
  return changed ? kept : previous;
}
