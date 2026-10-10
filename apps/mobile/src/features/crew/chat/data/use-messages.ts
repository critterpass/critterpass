/**
 * The crew chat timeline from the local database: synced messages in server `seq` order (the newest
 * window first, older windows on demand), then this device's unacknowledged sends in the order they
 * were queued, then sends the server refused (RETRY / DELETE). Order never reads a device clock or
 * a UUIDv7, so a phone set an hour off still sees the crew's order. Messages from crewmates the
 * user muted are left out; their own messages never are.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { STICKER_REF_KIND, type MuteMemberPayload } from '@cp/domain';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import {
  muteMemberCommand,
  payloadFromSummary,
  SEND_MESSAGE,
  type OutgoingMessage,
} from './chat-commands';
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

const TABLES = ['messages', 'users', 'commands', 'rejected_commands', 'user_settings'];

export interface Timeline {
  readonly messages: readonly ChatMessage[];
  /** More synced history exists below the loaded window. */
  readonly hasOlder: boolean;
  /** Highest synced `seq` loaded (0 when the chat is empty). */
  readonly lastSeq: number;
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

function localType(payload: OutgoingMessage, voice: boolean): ChatMessage['type'] {
  if (payload.sticker !== undefined) return 'sticker';
  if (voice) return 'voice';
  return payload.attachments.length > 0 ? 'photo' : 'text';
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
    type: localType(payload, voice),
    body: payload.sticker?.pose ?? payload.body,
    refKind: payload.sticker === undefined ? null : STICKER_REF_KIND,
    refId: payload.sticker?.form_id ?? null,
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
  const visible = synced
    .slice(0, window)
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

const EMPTY: Timeline = { messages: [], hasOlder: false, lastSeq: 0 };

export interface MessagesState extends Timeline {
  /** False until the first local read lands (the skeleton shows meanwhile). */
  readonly loaded: boolean;
  /** The newest seq at the first read: later messages arrived while the chat was open. */
  readonly openedSeq: number | null;
  /** How many synced messages the loaded window holds at most. */
  readonly window: number;
  readonly loadOlder: () => void;
}

/** `next`, holding on to everything of `previous` that did not change (the timeline itself too). */
export function keepTimeline(previous: Timeline, next: Timeline): Timeline {
  const messages = keepUnchanged(previous.messages, next.messages);
  return messages === previous.messages &&
    previous.hasOlder === next.hasOlder &&
    previous.lastSeq === next.lastSeq
    ? previous
    : { ...next, messages };
}

export function useMessages(crewId: string, me: string | null): MessagesState {
  const { db } = useLocalFirst();
  const [limit, setLimit] = useState(MESSAGE_WINDOW);
  const [state, setState] = useState<{
    timeline: Timeline;
    loaded: boolean;
    openedSeq: number | null;
  }>({ timeline: EMPTY, loaded: false, openedSeq: null });

  useEffect(() => {
    if (me === null) return undefined;
    const controller = new AbortController();
    const load = () =>
      loadTimeline(db, crewId, me, limit).then(
        (timeline) => {
          if (controller.signal.aborted) return;
          setState((previous) => {
            const kept = keepTimeline(previous.timeline, timeline);
            // A reload that changed nothing on screen re-renders nothing.
            if (previous.loaded && kept === previous.timeline) return previous;
            return {
              timeline: kept,
              loaded: true,
              openedSeq: previous.openedSeq ?? timeline.lastSeq,
            };
          });
        },
        () => undefined,
      );
    void load();
    db.onChange(
      { onChange: () => load() },
      { tables: TABLES, throttleMs: 30, signal: controller.signal },
    );
    return () => controller.abort();
  }, [db, crewId, me, limit]);

  const loadOlder = useCallback(() => {
    if (state.timeline.hasOlder) setLimit((current) => current + MESSAGE_WINDOW);
  }, [state.timeline.hasOlder]);

  return useMemo(
    () => ({
      ...state.timeline,
      loaded: state.loaded,
      openedSeq: state.openedSeq,
      window: limit,
      loadOlder,
    }),
    [state, limit, loadOlder],
  );
}
