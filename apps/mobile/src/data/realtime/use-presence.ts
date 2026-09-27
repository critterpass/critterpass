/**
 * Who is on a presence channel right now (`crew`, `crew_chat`, `trip_setup`, `trip_presence`):
 * a snapshot from Centrifugo presence on every (re)subscribe, then kept current by join/leave.
 * One person with two devices is one member; `name`/`avatar` come from the subscribe proxy's
 * `info` (services/api/src/realtime/info.ts).
 */
import type { ChannelNamespace } from '@cp/domain';
import type { ClientInfo } from 'centrifuge';
import { useMemo, useState } from 'react';

import { useChannel, useRealtimeClient } from './use-channel';

export interface PresenceMember {
  readonly uid: string;
  readonly name: string | null;
  readonly avatar: string | null;
}

function field(info: unknown, key: 'name' | 'avatar'): string | null {
  if (typeof info !== 'object' || info === null) return null;
  const value = (info as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/** Connections keyed by client id, folded to one member per uid in first-seen order. */
export function membersOf(connections: ReadonlyMap<string, ClientInfo>): PresenceMember[] {
  const members = new Map<string, PresenceMember>();
  for (const info of connections.values()) {
    if (members.has(info.user)) continue;
    members.set(info.user, {
      uid: info.user,
      name: field(info.chanInfo, 'name'),
      avatar: field(info.chanInfo, 'avatar'),
    });
  }
  return [...members.values()];
}

const NONE: ReadonlyMap<string, ClientInfo> = new Map();

interface Snapshot {
  /** The channel these connections belong to, so a changed `id` never shows the old channel. */
  readonly key: string;
  readonly connections: ReadonlyMap<string, ClientInfo>;
}

export function usePresence(namespace: ChannelNamespace, id: string | null): PresenceMember[] {
  const client = useRealtimeClient();
  const key = `${namespace}:${id ?? ''}`;
  const [snapshot, setSnapshot] = useState<Snapshot>({ key, connections: NONE });

  function update(change: (connections: Map<string, ClientInfo>) => void): void {
    setSnapshot((current) => {
      const next = new Map(current.key === key ? current.connections : NONE);
      change(next);
      return { key, connections: next };
    });
  }

  useChannel(namespace, id, {
    onSubscribed: () => {
      const subscription = id === null ? undefined : client?.channels.subscription(namespace, id);
      if (subscription === undefined) return;
      subscription.presence().then(
        (result) => setSnapshot({ key, connections: new Map(Object.entries(result.clients)) }),
        () => undefined,
      );
    },
    onJoin: (info) => update((connections) => connections.set(info.client, info)),
    onLeave: (info) => update((connections) => connections.delete(info.client)),
  });

  const connections = snapshot.key === key ? snapshot.connections : NONE;
  return useMemo(() => membersOf(connections), [connections]);
}
