/**
 * One read of the crew chat timeline from the local database, and what a later read keeps of an
 * earlier one: synced messages in server `seq` order, then this device's unacknowledged sends in
 * the order they were queued, then sends the server refused (RETRY / DELETE). Messages from
 * crewmates the user muted are left out; their own messages never are.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import type { MuteMemberPayload } from '@cp/domain';

import {
  muteMemberCommand,
  payloadFromSummary,
  SEND_MESSAGE,
  type OutgoingMessage,
} from './chat-commands';
import { CHAT_SYNC_WINDOW } from './older-messages';
import {
  fromRow,
  keepUnchanged,
  parseList,
  quoted,
  type ChatMessage,
  type DeliveryStatus,
  type MessageRow,
} from './rows';

/** How many synced messages one window holds; older windows load locally, 200 at a time. */
export const MESSAGE_WINDOW = 200;

/** The `messages` columns a timeline row is built from. */
const MESSAGE_COLUMNS = [
  'id',
  'crew_id',
  'trip_id',
  'seq',
  'sender_kind',
  'sender_id',
  'guide_id',
  'type',
  'body',
  'ref_kind',
  'ref_id',
  'reply_to_id',
  'mentions',
  'mentions_guide',
  'attachments',
  'edited_at',
  'deleted_at',
  'created_at',
]
  .map((column) => `m.${column}`)
  .join(', ');

export interface Timeline {
  readonly messages: readonly ChatMessage[];
  /** More synced history exists below the loaded window. */
  readonly hasOlder: boolean;
  /** Highest synced `seq` loaded (0 when the chat is empty). */
  readonly lastSeq: number;
  /** Lowest synced `seq` loaded (0 when the chat is empty). */
  readonly firstSeq: number;
  /** Crewmates whose messages are left out. */
  readonly muted: ReadonlySet<string>;
}

interface QueuedRow {
  readonly id: string;
  readonly status: 'queued' | 'sending' | 'done';
  readonly envelope: string;
  readonly created_at: string;
}

interface RejectedRow {
  readonly id: string;
  readonly code: string;
  readonly summary: string | null;
  readonly rejected_at: string;
}

function localMessage(
  id: string,
  me: string,
  payload: OutgoingMessage,
  createdAt: string,
  status: DeliveryStatus,
): ChatMessage {
  const voice = payload.attachments.some((attachment) => attachment.kind === 'voice');
  return {
    id,
    crewId: payload.crew_id,
    seq: null,
    senderKind: 'user',
    senderId: me,
    senderName: null,
    guideId: null,
    type: voice ? 'voice' : payload.attachments.length > 0 ? 'photo' : 'text',
    body: payload.body,
    refKind: null,
    refId: null,
    replyToId: payload.reply_to ?? null,
    mentions: payload.mentions,
    mentionsGuide: payload.mentions_guide,
    attachments: payload.attachments.map((attachment) => ({
      media_id: attachment.media_key,
      media_key: attachment.media_key,
      kind: attachment.kind,
      w: attachment.w ?? null,
      h: attachment.h ?? null,
      duration_ms: attachment.duration_ms ?? null,
      ...(attachment.peaks === undefined ? {} : { peaks: [...attachment.peaks] }),
    })),
    edited: false,
    deleted: false,
    createdAt,
    status,
  };
}

/** One read of the timeline; `useMessages` re-runs it whenever a source table changes. */
export async function loadTimeline(
  db: AbstractPowerSyncDatabase,
  crewId: string,
  me: string,
  limit: number = MESSAGE_WINDOW,
): Promise<Timeline> {
  const crew = quoted(crewId);
  const window = Math.max(1, Math.floor(limit));
  const [synced, queued, rejected, settings, muting] = await Promise.all([
    db.getAll<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS}, coalesce(u.display_name, g.name) AS sender_name,
              r.display_name AS ref_name
         FROM messages m LEFT JOIN users u ON u.id = m.sender_id
         LEFT JOIN guides g ON g.id = m.guide_id
         LEFT JOIN users r ON r.id = m.ref_id AND m.sender_kind = 'system'
        WHERE m.crew_id = ${crew}
        ORDER BY m.seq DESC LIMIT ${window + 1}`,
    ),
    db.getAll<QueuedRow>(
      `SELECT c.id, c.status, c.envelope, c.created_at FROM commands c
        WHERE c.cmd = '${SEND_MESSAGE}'
          AND json_extract(c.envelope, '$.payload.crew_id') = ${crew}
          AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = c.id)
        ORDER BY c.seq`,
    ),
    db.getAll<RejectedRow>(
      `SELECT id, code, summary, rejected_at FROM rejected_commands
        WHERE cmd = '${SEND_MESSAGE}' ORDER BY rejected_at, id`,
    ),
    db.getOptional<{ muted_uids: string | null }>(
      `SELECT muted_uids FROM user_settings WHERE user_id = ${quoted(me)}`,
    ),
    db.getAll<{ envelope: string }>(
      `SELECT envelope FROM commands WHERE cmd = '${muteMemberCommand.name}' ORDER BY seq`,
    ),
  ]);
  const muted = withPendingMutes(parseList(settings?.muted_uids), muting);
  const hasOlder = synced.length > window;
  const loaded = synced.slice(0, window);
  const visible = loaded
    .reverse()
    .map(fromRow)
    .filter((message) => message.senderId === me || !muted.has(message.senderId ?? ''));

  const pending = queued.flatMap((row) => {
    const payload = (JSON.parse(row.envelope) as { payload?: OutgoingMessage }).payload;
    if (payload === undefined) return [];
    const status: DeliveryStatus = row.status === 'done' ? 'uploaded' : 'sending';
    return [localMessage(row.id, me, payload, row.created_at, status)];
  });
  const failed = rejected.flatMap((row) => {
    if (row.summary === null) return [];
    const payload = payloadFromSummary(
      JSON.parse(row.summary) as { values?: Record<string, unknown> },
    );
    if (payload?.crew_id !== crewId) return [];
    return [
      { ...localMessage(row.id, me, payload, row.rejected_at, 'failed'), failureCode: row.code },
    ];
  });
  return {
    messages: [...visible, ...pending, ...failed],
    hasOlder,
    lastSeq: synced[0] === undefined ? 0 : Number(synced[0].seq),
    firstSeq: loaded[0] === undefined ? 0 : Number(loaded[0].seq),
    muted,
  };
}

/**
 * The synced mute list with this device's mute and unmute commands applied in queue order, so a
 * crewmate muted here drops out of the timeline at once rather than when the setting syncs back.
 */
function withPendingMutes(
  synced: readonly string[],
  commands: readonly { envelope: string }[],
): Set<string> {
  const muted = new Set(synced);
  for (const row of commands) {
    const payload = (JSON.parse(row.envelope) as { payload?: Partial<MuteMemberPayload> }).payload;
    if (typeof payload?.uid !== 'string') continue;
    if (payload.muted === true) muted.add(payload.uid);
    else muted.delete(payload.uid);
  }
  return muted;
}

export const EMPTY_TIMELINE: Timeline = {
  messages: [],
  hasOlder: false,
  lastSeq: 0,
  firstSeq: 0,
  muted: new Set(),
};

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

/** `next`, holding on to everything of `previous` that did not change (the timeline itself too). */
export function keepTimeline(previous: Timeline, next: Timeline): Timeline {
  const messages = keepUnchanged(previous.messages, next.messages);
  const muted = sameSet(previous.muted, next.muted) ? previous.muted : next.muted;
  return messages === previous.messages &&
    muted === previous.muted &&
    previous.hasOlder === next.hasOlder &&
    previous.lastSeq === next.lastSeq &&
    previous.firstSeq === next.firstSeq
    ? previous
    : { ...next, messages, muted };
}

/**
 * The phone was away for more than a window: the rows it holds now start beyond the end of the
 * ones it held before, and the messages between were never on it. Nothing held from before joins
 * on to the new rows.
 */
export function movedApart(previous: Timeline, next: Timeline): boolean {
  return previous.lastSeq > 0 && next.firstSeq > previous.lastSeq + 1;
}

/**
 * Rows the phone held a moment ago and has now let go of because newer messages pushed them out
 * of its window (never one that moderation hid: that one is still inside the window by `seq`).
 */
export function leftWindow(previous: Timeline, next: Timeline): readonly ChatMessage[] {
  if (previous.firstSeq === 0 || next.firstSeq <= previous.firstSeq) return [];
  const here = new Set(next.messages.map((message) => message.id));
  return previous.messages.filter(
    (message) =>
      message.seq !== null &&
      message.seq < next.firstSeq &&
      message.seq <= next.lastSeq - CHAT_SYNC_WINDOW &&
      !here.has(message.id),
  );
}
