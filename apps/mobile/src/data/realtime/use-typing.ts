/**
 * Typing indicators (docs/api-contracts-async.md §1.1 "Throttle"): a client sends at most one
 * `{type: 'typing'}` per 3 s per channel (the publish proxy drops anything faster), and a peer
 * counts as typing for 5 s after their last one, so a stopped typist fades without a "stopped"
 * message.
 */
import type { ChannelNamespace, RtEnvelope } from '@cp/domain';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useChannel, useRealtimeClient } from './use-channel';

export const TYPING_THROTTLE_MS = 3000;
export const TYPING_EXPIRY_MS = 5000;

/** Leading-edge throttle: `take()` is true at most once per `intervalMs`. */
export function createThrottle(intervalMs: number, now: () => number = Date.now) {
  let last = Number.NEGATIVE_INFINITY;
  return {
    take(): boolean {
      const at = now();
      if (at - last < intervalMs) return false;
      last = at;
      return true;
    },
  };
}

/** Who is typing: each uid expires `expiryMs` after their latest typing event. */
export class TypingRoster {
  private readonly until = new Map<string, number>();

  constructor(private readonly expiryMs: number = TYPING_EXPIRY_MS) {}

  mark(uid: string, at: number): void {
    this.until.set(uid, at + this.expiryMs);
  }

  /** Uids still typing at `at`, dropping the expired ones. */
  active(at: number): string[] {
    for (const [uid, until] of this.until) if (until <= at) this.until.delete(uid);
    return [...this.until.keys()];
  }

  /** When the next entry expires, or `undefined` when nobody is typing. */
  nextExpiry(): number | undefined {
    let next: number | undefined;
    for (const until of this.until.values()) if (next === undefined || until < next) next = until;
    return next;
  }
}

export interface TypingState {
  /** Other people typing now (never the signed-in user). */
  readonly typing: readonly string[];
  /** Call on every keystroke; sends at most one typing event per 3 s. */
  readonly notifyTyping: () => void;
}

function typingUid(envelope: RtEnvelope): string | undefined {
  if (envelope.type !== 'typing') return undefined;
  const data = envelope.data as { uid?: unknown };
  return typeof data.uid === 'string' ? data.uid : undefined;
}

export function useTyping(
  namespace: Extract<ChannelNamespace, 'crew_chat' | 'trip_presence'>,
  id: string | null,
): TypingState {
  const client = useRealtimeClient();
  const roster = useMemo(() => new TypingRoster(), []);
  const throttle = useMemo(() => createThrottle(TYPING_THROTTLE_MS), []);
  const [typing, setTyping] = useState<readonly string[]>([]);
  const [expiresAt, setExpiresAt] = useState<number | undefined>(undefined);

  const refresh = useCallback(
    (at: number = Date.now()) => {
      setTyping(roster.active(at));
      setExpiresAt(roster.nextExpiry());
    },
    [roster],
  );

  useChannel(namespace, id, {
    onEvent: (envelope) => {
      const uid = typingUid(envelope);
      if (uid === undefined || uid === client?.uid) return;
      roster.mark(uid, Date.now());
      refresh();
    },
  });

  useEffect(() => {
    if (expiresAt === undefined) return undefined;
    // A timer can fire a millisecond before Date.now() reaches its deadline. Evaluating at the
    // deadline itself guarantees the entry that scheduled it expires; otherwise the next expiry would
    // equal the current one, React would skip the update, and no further timer would ever run.
    const timer = setTimeout(
      () => refresh(Math.max(Date.now(), expiresAt)),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, refresh]);

  const notifyTyping = useCallback(() => {
    if (id === null) return;
    const subscription = client?.channels.subscription(namespace, id);
    if (subscription === undefined || !throttle.take()) return;
    subscription.publish({ type: 'typing' }).catch(() => undefined);
  }, [client, namespace, id, throttle]);

  return { typing, notifyTyping };
}
