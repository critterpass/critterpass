/**
 * Two signed-in devices sharing one crew, as the realtime scenarios need them: A creates the crew
 * through its upload queue, B joins, both see the crew row through sync, and both hold the crew's
 * realtime channel.
 */
import { generateUuidV7 } from '@cp/domain';

import {
  CREATE_CREW,
  JOIN_CREW,
  newDevice,
  openClient,
  signInAnonymously,
  type ChannelHandlers,
  type Device,
  type NodeSyncClient,
  type Session,
} from '../clients';
import type { Stack } from '../stack';
import { waitFor } from '../support';

export interface Member {
  readonly session: Session;
  readonly device: Device;
  readonly client: NodeSyncClient;
  readonly events: { id: string; type: string; data: unknown; at: number }[];
  release(): void;
}

export interface CrewPair {
  readonly crewId: string;
  readonly a: Member;
  readonly b: Member;
  close(): Promise<void>;
}

export async function syncedCrewNames(client: NodeSyncClient, crewId: string) {
  return client.db.getAll<{ name: string }>('SELECT name FROM crews WHERE id = ?', [crewId]);
}

async function member(stack: Stack): Promise<Omit<Member, 'events' | 'release'>> {
  const session = await signInAnonymously(stack);
  const device = newDevice();
  const client = await openClient(stack, { device, session });
  return { session, device, client };
}

function listen(base: Omit<Member, 'events' | 'release'>, crewId: string, subscribed: Set<string>) {
  const events: Member['events'] = [];
  const handlers: ChannelHandlers = {
    onEvent: (envelope) => events.push({ ...envelope, at: performance.now() }),
    onSubscribed: () => subscribed.add(base.session.uid),
  };
  base.client.realtime.connect();
  const release = base.client.realtime.channels.acquire('crew', crewId, handlers);
  return { ...base, events, release };
}

export async function openCrewPair(stack: Stack): Promise<CrewPair> {
  const crewId = generateUuidV7();
  const opened: Omit<Member, 'events' | 'release'>[] = [];
  const close = async () => {
    for (const { client, device } of opened) {
      await client.close();
      device.remove();
    }
  };
  try {
    const a = await member(stack);
    opened.push(a);
    const b = await member(stack);
    opened.push(b);
    await a.client.core.commands.send(CREATE_CREW, { crew_id: crewId, name: 'Pair' });
    await waitFor(async () => (await syncedCrewNames(a.client, crewId)).length === 1, 'A syncs');
    await b.client.core.commands.send(JOIN_CREW, { crew_id: crewId });
    await waitFor(async () => (await syncedCrewNames(b.client, crewId)).length === 1, 'B syncs');

    const subscribed = new Set<string>();
    const pair = { crewId, a: listen(a, crewId, subscribed), b: listen(b, crewId, subscribed) };
    await waitFor(() => subscribed.size === 2, 'both members to join the crew channel');
    return { ...pair, close };
  } catch (error) {
    await close();
    throw error;
  }
}
