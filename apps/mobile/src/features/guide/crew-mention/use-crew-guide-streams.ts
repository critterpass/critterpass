/**
 * The guide answering in crew chat as it happens. The asker's app streams the reply to its own
 * @mention (`POST /v1/guide/crew/{crew_id}/mentions`) as soon as the mention has synced; everyone
 * else sees the same reply arrive as `guide.token` on `crew_chat:{crew_id}`, and the guide's
 * typing on `typing {guide: true}`. A live reply gives way to the saved guide message once that
 * syncs. A mention the worker already answered is left to it; a spent meter becomes a hint.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire codes and event types, never copy. */
import { useEffect, useMemo, useRef, useState } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useChannel } from '@/data/realtime/use-channel';

import { GuideStreamError } from '../chat/data/guide-frames';
import { useGuideServices } from '../chat/data/guide-services';
import { useLiveQuery } from '../chat/data/live-rows';
import { quotaOf, type QuotaSpent } from '../chat/data/use-guide-turn';

/** A mention older than this is left to the worker's answer. */
export const MENTION_FRESH_MS = 90_000;
/** The guide's typing shows at most this long without a token. */
export const GUIDE_TYPING_MS = 8_000;

export interface LiveGuideReply {
  readonly key: string;
  readonly text: string;
}

interface MessageRow {
  readonly id: string;
  readonly sender_kind: string;
  readonly sender_id: string | null;
  readonly mentions_guide: number;
  readonly reply_to_id: string | null;
  readonly created_at: string;
}

const SQL = `SELECT id, sender_kind, sender_id, mentions_guide, reply_to_id, created_at FROM messages
  WHERE crew_id = ? AND (
    sender_kind = 'guide'
    OR (mentions_guide = 1 AND sender_id = (SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}'))
  )
  ORDER BY seq DESC LIMIT 30`;

/** My synced mentions from the last minute or so that the guide has not answered yet. */
export function unansweredMentions(rows: readonly MessageRow[], now: number): string[] {
  const answered = new Set(
    rows.filter((row) => row.sender_kind === 'guide').map((row) => row.reply_to_id),
  );
  return rows
    .filter(
      (row) =>
        row.sender_kind === 'user' &&
        row.mentions_guide === 1 &&
        !answered.has(row.id) &&
        now - Date.parse(row.created_at) < MENTION_FRESH_MS,
    )
    .map((row) => row.id);
}

/** Mentions this app run already asked about (a remount never asks twice). */
const asked = new Set<string>();

export function useCrewGuideStreams(crewId: string) {
  const services = useGuideServices();
  const rows = useLiveQuery<MessageRow>(SQL, [crewId], ['messages', 'local_state']);
  /** Streamed text per mention; null once its stream was dropped (the worker's answer follows). */
  const [own, setOwn] = useState<ReadonlyMap<string, string | null>>(new Map());
  const [others, setOthers] = useState<ReadonlyMap<string, { seq: number; text: string }>>(
    new Map(),
  );
  const [typingUntil, setTypingUntil] = useState(0);
  const [spent, setSpent] = useState<QuotaSpent | null>(null);
  const streaming = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  const pending = useMemo(() => unansweredMentions(rows ?? [], now), [rows, now]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    for (const mentionId of pending) {
      if (asked.has(mentionId)) continue;
      asked.add(mentionId);
      // The reply streams to the end even if the chat closes: the crew is watching it too.
      const controller = new AbortController();
      streaming.current += 1;
      const append = (text: string) =>
        setOwn((current) =>
          current.get(mentionId) === null
            ? current
            : new Map(current).set(mentionId, (current.get(mentionId) ?? '') + text),
        );
      services
        .streamMention(
          crewId,
          mentionId,
          (frame) => {
            if (frame.type === 'token' && typeof frame.data['text'] === 'string') {
              append(frame.data['text']);
            }
          },
          controller.signal,
        )
        .catch((error: unknown) => {
          if (error instanceof GuideStreamError && error.code === 'QUOTA_EXHAUSTED') {
            setSpent(quotaOf(error.detail));
          }
          // Answered by the worker, or the stream dropped: the crew channel and sync carry it.
          setOwn((current) =>
            (current.get(mentionId) ?? '') === '' ? new Map(current).set(mentionId, null) : current,
          );
        })
        .finally(() => {
          streaming.current -= 1;
        });
    }
  }, [pending, services, crewId]);

  useChannel('crew_chat', crewId, {
    onEvent: (envelope) => {
      const data = envelope.data as Record<string, unknown>;
      if (envelope.type === 'typing' && data['guide'] === true) {
        setTypingUntil(Date.now() + GUIDE_TYPING_MS);
      }
      // While this app streams its own mention, the crew copy of the same reply is skipped.
      if (envelope.type !== 'guide.token' || streaming.current > 0) return;
      const streamId = data['stream_id'];
      const seq = data['seq'];
      const text = data['text'];
      if (typeof streamId !== 'string' || typeof seq !== 'number' || typeof text !== 'string') {
        return;
      }
      setOthers((current) => {
        const known = current.get(streamId);
        if (known !== undefined && known.seq >= seq) return current;
        return new Map(current).set(streamId, { seq, text: (known?.text ?? '') + text });
      });
      setTypingUntil(0);
    },
  });

  const saved = new Set((rows ?? []).map((row) => row.id));
  const repliedTo = new Set(
    (rows ?? []).filter((row) => row.sender_kind === 'guide').map((row) => row.reply_to_id),
  );
  const replies: LiveGuideReply[] = [
    ...pending
      .filter((id) => asked.has(id) && own.get(id) !== null && !repliedTo.has(id))
      .map((key) => ({ key, text: own.get(key) ?? '' })),
    ...[...others]
      .filter(([id]) => !saved.has(id))
      .map(([key, value]) => ({ key, text: value.text })),
  ];
  return {
    replies,
    typing: replies.length === 0 && typingUntil > now,
    spent,
  };
}
