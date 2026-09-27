/**
 * Element-anchored presence on `trip_presence:<tripId>` (docs/api-contracts-async.md §1.1): the
 * element this person is on (`plan_item:<id>`), sent at most 5 times a second with the latest value
 * winning, and `null` on blur or unmount so peers drop the cursor. Peers' cursors also drop when
 * they leave the channel, which covers a closed app that never sent its `null`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI realtime data layer: channel namespaces,
   event types and symbol descriptions, never rendered copy. */
import type { RtEnvelope } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { useChannel, useRealtimeClient } from './use-channel';

/**
 * Under 5 Hz: the publish proxy drops a second cursor arriving inside 200 ms of the previous one,
 * so sends are spaced with 50 ms of headroom for network jitter; a dropped send would be the
 * latest-wins value and leave peers on a stale anchor.
 */
export const ANCHOR_INTERVAL_MS = 250;

export interface AnchorPublisherOptions {
  /** A rejected promise (e.g. the proxy's rate window) triggers one resend of a still-current value. */
  readonly publish: (anchor: string | null) => unknown;
  readonly intervalMs?: number;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/**
 * Rate-limited, latest-wins anchor sender: a change inside the window is held and sent when the
 * window ends (only the newest value), and a value equal to what peers already have is not resent.
 */
export function createAnchorPublisher(options: AnchorPublisherOptions) {
  const intervalMs = options.intervalMs ?? ANCHOR_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  // `undefined` = peers know nothing about us yet (fresh subscription), so any value is news.
  let sent: string | null | undefined = null;
  let sentAt = Number.NEGATIVE_INFINITY;
  let pending: { readonly anchor: string | null; readonly retry?: boolean } | undefined;
  let timer: unknown;

  function send(anchor: string | null, retry = true): void {
    sent = anchor;
    sentAt = now();
    const result = options.publish(anchor);
    if (!(result instanceof Promise)) return;
    result.catch(() => {
      // Peers never got the latest value: send it once more after the window.
      if (!retry || sent !== anchor || timer !== undefined) return;
      pending = { anchor, retry: false };
      sent = undefined;
      timer = setTimer(flush, intervalMs);
    });
  }

  function flush(): void {
    timer = undefined;
    const next = pending;
    pending = undefined;
    if (next !== undefined && next.anchor !== sent) send(next.anchor, next.retry ?? true);
  }

  return {
    set(anchor: string | null): void {
      if (timer !== undefined) {
        pending = { anchor };
        return;
      }
      if (anchor === sent) return;
      const wait = sentAt + intervalMs - now();
      if (wait <= 0) {
        send(anchor);
        return;
      }
      pending = { anchor };
      timer = setTimer(flush, wait);
    },
    /** A resubscribe dropped our cursor at every peer: the next `set` sends even if unchanged. */
    forget(): void {
      sent = undefined;
    },
    /** Stops any held send (the connection is going away with the component). */
    cancel(): void {
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}

function cursorOf(envelope: RtEnvelope): { uid: string; anchor: string | null } | undefined {
  if (envelope.type !== 'cursor') return undefined;
  const data = envelope.data as { uid: string; anchor: string | null };
  return { uid: data.uid, anchor: data.anchor };
}

/** Publishes this person's `anchor` (null = none) and returns peers' anchors keyed by uid. */
export function useAnchoredPresence(
  tripId: string | null,
  anchor: string | null,
): ReadonlyMap<string, string> {
  const client = useRealtimeClient();
  const [cursors, setCursors] = useState<ReadonlyMap<string, string>>(new Map());

  const publisher = useMemo(
    () =>
      createAnchorPublisher({
        publish: (value) => {
          const subscription =
            tripId === null ? undefined : client?.channels.subscription('trip_presence', tripId);
          return subscription?.publish({ type: 'cursor', data: { anchor: value } });
        },
      }),
    [client, tripId],
  );

  // Declared before the channel hold so unmount sends the blur while the subscription still exists.
  useEffect(() => {
    publisher.set(anchor);
  }, [publisher, anchor]);
  useEffect(
    () => () => {
      publisher.cancel();
      publisher.set(null);
    },
    [publisher],
  );

  useChannel('trip_presence', tripId, {
    onSubscribed: () => {
      setCursors(new Map());
      publisher.forget();
      if (anchor !== null) publisher.set(anchor);
    },
    onEvent: (envelope) => {
      const cursor = cursorOf(envelope);
      if (cursor === undefined || cursor.uid === client?.uid) return;
      setCursors((current) => {
        const next = new Map(current);
        if (cursor.anchor === null) next.delete(cursor.uid);
        else next.set(cursor.uid, cursor.anchor);
        return next;
      });
    },
    onLeave: (info) =>
      setCursors((current) => {
        if (!current.has(info.user)) return current;
        const next = new Map(current);
        next.delete(info.user);
        return next;
      }),
  });

  return cursors;
}
