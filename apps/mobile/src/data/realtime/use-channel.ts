/**
 * React access to the realtime client. `useChannel` holds one reference on a channel for the
 * component's lifetime (the registry subscribes on the first holder and unsubscribes after the
 * last), and always calls the latest handlers without resubscribing when they change identity.
 */
import type { ChannelNamespace } from '@cp/domain';
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';

import type { RealtimeClient } from './client';
import type { ChannelHandlers } from './subscriptions';

export const RealtimeClientContext = createContext<RealtimeClient | null>(null);

/** The app's realtime client; `null` before sign-in or while signed out. */
export function useRealtimeClient(): RealtimeClient | null {
  return useContext(RealtimeClientContext);
}

/** Subscribes while mounted; `id: null` holds nothing (e.g. no crew selected yet). */
export function useChannel(
  namespace: ChannelNamespace,
  id: string | null,
  handlers: ChannelHandlers,
): void {
  const client = useRealtimeClient();
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (client === null || id === null) return undefined;
    return client.channels.acquire(namespace, id, {
      onEvent: (envelope) => latest.current.onEvent?.(envelope),
      onChannelReset: () => latest.current.onChannelReset?.(),
      onJoin: (info) => latest.current.onJoin?.(info),
      onLeave: (info) => latest.current.onLeave?.(info),
      onSubscribed: () => latest.current.onSubscribed?.(),
    });
  }, [client, namespace, id]);
}
