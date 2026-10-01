/**
 * @jest-environment-options {"customExportConditions": ["node", "require", "default"]}
 *
 * Presence, typing and anchored-cursor hooks rendered against a real Centrifugo, two signed-in
 * clients talking through it. Client publications pass through a publish proxy that re-envelopes
 * them the way the api does, and records each one so send rates are measured at the server edge.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { channelName } from '@cp/domain';
import { SubscriptionState } from 'centrifuge';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { createRealtimeClient, type RealtimeClient } from '../client';
import { createRecoveryStore } from '../recovery-store';
import { startCentrifugo, type CentrifugoHarness } from '../test-support/centrifugo';
import { sleep, waitUntil } from '../test-support/lifecycle';
import { useAnchoredPresence } from '../use-anchored-presence';
import { RealtimeClientContext } from '../use-channel';
import { usePresence } from '../use-presence';
import { useTyping } from '../use-typing';

let centrifugo: CentrifugoHarness;
const clients: RealtimeClient[] = [];

beforeAll(async () => {
  // Socket events drive these hooks' state from outside any act() scope, as in the app; RNTL's
  // waitFor observes the result instead.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  centrifugo = await startCentrifugo();
}, 240_000);

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await centrifugo?.stop();
});

function connect(uid: string = randomUUID()): RealtimeClient {
  const client = createRealtimeClient({
    uid,
    url: centrifugo.wsUrl,
    getToken: () => Promise.resolve(centrifugo.token(uid)),
    positions: createRecoveryStore(createMMKV({ id: `rt-${uid}` })),
  });
  clients.push(client);
  client.connect();
  return client;
}

function providerFor(client: RealtimeClient) {
  return function Provider({ children }: { children: ReactNode }) {
    return createElement(RealtimeClientContext, { value: client }, children);
  };
}

function publishesFrom(uid: string, type: string) {
  return centrifugo.clientPublishes.filter((entry) => entry.user === uid && entry.type === type);
}

function subscribed(client: RealtimeClient, channel: string): boolean {
  return client.centrifuge.getSubscription(channel)?.state === SubscriptionState.Subscribed;
}

describe('usePresence', () => {
  it('lists who is on the channel from presence, then follows joins and leaves', async () => {
    const crewId = randomUUID();
    const channel = channelName('crew_chat', crewId);
    const alice = connect();
    const bob = connect();
    const view = await renderHook(() => usePresence('crew_chat', crewId), {
      wrapper: providerFor(alice),
    });
    await waitFor(() => expect(view.result.current.map((m) => m.uid)).toEqual([alice.uid]));
    expect(view.result.current[0]?.name).toBe(`name-${alice.uid.slice(0, 8)}`);

    const release = bob.channels.acquire('crew_chat', crewId, {});
    await waitUntil(() => subscribed(bob, channel), 10_000, 'bob subscribed');
    await waitFor(() =>
      expect(view.result.current.map((m) => m.uid).sort()).toEqual([alice.uid, bob.uid].sort()),
    );

    release();
    await waitFor(() => expect(view.result.current.map((m) => m.uid)).toEqual([alice.uid]));
    await view.unmount();
  }, 30_000);
});

describe('useTyping', () => {
  it('sends one typing event per 3 s and shows a peer for 5 s after their last one', async () => {
    const crewId = randomUUID();
    const channel = channelName('crew_chat', crewId);
    const alice = connect();
    const bob = connect();
    const watcher = await renderHook(() => useTyping('crew_chat', crewId), {
      wrapper: providerFor(alice),
    });
    const typist = await renderHook(() => useTyping('crew_chat', crewId), {
      wrapper: providerFor(bob),
    });
    await waitUntil(
      () => subscribed(alice, channel) && subscribed(bob, channel),
      10_000,
      'both subscribed',
    );

    // A keystroke every 100 ms for 3.5 s.
    for (let key = 0; key < 35; key += 1) {
      typist.result.current.notifyTyping();
      await sleep(100);
    }
    await waitUntil(() => publishesFrom(bob.uid, 'typing').length === 2, 2000, 'second typing');
    const sends = publishesFrom(bob.uid, 'typing');
    expect(sends[1]!.at - sends[0]!.at).toBeGreaterThanOrEqual(2900); // client throttle, network jitter aside

    await waitFor(() => expect(watcher.result.current.typing).toEqual([bob.uid]));
    expect(typist.result.current.typing).toEqual([]);

    // The last typing event left around the 3 s mark; 5 s later bob is no longer typing.
    await waitFor(() => expect(watcher.result.current.typing).toEqual([]), { timeout: 8000 });
    expect(Date.now() - sends[1]!.at).toBeGreaterThanOrEqual(4900);
    await watcher.unmount();
    await typist.unmount();
  }, 40_000);
});

describe('useAnchoredPresence', () => {
  it('sends anchors at most 5 times a second and clears on blur and unmount', async () => {
    const tripId = randomUUID();
    const channel = channelName('trip_presence', tripId);
    const alice = connect();
    const bob = connect();
    const peer = await renderHook(() => useAnchoredPresence(tripId, null), {
      wrapper: providerFor(alice),
    });
    const mover = await renderHook<ReadonlyMap<string, string>, { anchor: string | null }>(
      ({ anchor }) => useAnchoredPresence(tripId, anchor),
      {
        wrapper: providerFor(bob),
        initialProps: { anchor: null },
      },
    );
    await waitUntil(
      () => subscribed(alice, channel) && subscribed(bob, channel),
      10_000,
      'both subscribed',
    );

    // Scrolling across a plan: a new anchor every 20 ms for 2 s.
    for (let frame = 0; frame < 100; frame += 1) {
      await mover.rerender({ anchor: `plan_item:item${frame}` });
      await sleep(20);
    }
    await sleep(400);
    const sends = publishesFrom(bob.uid, 'cursor');
    // Arrival times carry network jitter; the exact client spacing is proven by the unit suite.
    const seconds = (sends.at(-1)!.at - sends[0]!.at) / 1000;
    expect((sends.length - 1) / seconds).toBeLessThanOrEqual(5);
    expect(sends.length).toBeLessThan(20); // of 100 moves
    expect(sends.at(-1)?.data).toEqual({ anchor: 'plan_item:item99' });
    await waitFor(() => expect(peer.result.current.get(bob.uid)).toBe('plan_item:item99'));

    await mover.rerender({ anchor: null });
    await waitFor(() => expect(peer.result.current.has(bob.uid)).toBe(false));

    await mover.rerender({ anchor: 'plan_item:again' });
    await waitFor(() => expect(peer.result.current.get(bob.uid)).toBe('plan_item:again'));
    await mover.unmount();
    await waitFor(() => expect(peer.result.current.has(bob.uid)).toBe(false));
    await peer.unmount();
  }, 40_000);
});
