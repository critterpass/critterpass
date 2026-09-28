/**
 * The crew chat timeline from the local database: synced messages in server `seq` order (the newest
 * window first, older windows on demand), then this device's unacknowledged sends in the order they
 * were queued, then sends the server refused (RETRY / DELETE). Order never reads a device clock or
 * a UUIDv7, so a phone set an hour off still sees the crew's order. Messages from crewmates the
 * user muted are left out; their own messages never are.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { payloadFromSummary, SEND_MESSAGE, type OutgoingMessage } from './chat-commands';
import {
  fromRow,
  parseList,
  quoted,
  type ChatMessage,
  type DeliveryStatus,
  type MessageRow,
} from './rows';

/** How many synced messages one window holds; older windows load locally, 200 at a time. */
export const MESSAGE_WINDOW = 200;

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
  const [synced, queued, rejected, settings] = await Promise.all([
    db.getAll<MessageRow>(
      `SELECT m.*, u.display_name AS sender_name
         FROM messages m LEFT JOIN users u ON u.id = m.sender_id
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
  ]);
  const muted = new Set(parseList(settings?.muted_uids));
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

const EMPTY: Timeline = { messages: [], hasOlder: false, lastSeq: 0 };

export interface MessagesState extends Timeline {
  /** False until the first local read lands (the skeleton shows meanwhile). */
  readonly loaded: boolean;
  readonly loadOlder: () => void;
}

export function useMessages(crewId: string, me: string | null): MessagesState {
  const { db } = useLocalFirst();
  const [limit, setLimit] = useState(MESSAGE_WINDOW);
  const [state, setState] = useState<{ timeline: Timeline; loaded: boolean }>({
    timeline: EMPTY,
    loaded: false,
  });

  useEffect(() => {
    if (me === null) return undefined;
    const controller = new AbortController();
    const load = () =>
      loadTimeline(db, crewId, me, limit).then(
        (timeline) => {
          if (!controller.signal.aborted) setState({ timeline, loaded: true });
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

  return { ...state.timeline, loaded: state.loaded, loadOlder };
}
