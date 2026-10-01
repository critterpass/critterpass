/**
 * @jest-environment node
 *
 * The realtime client against a real Centrifugo running this repo's config: background recovery,
 * lossy resets, cold-start resume from persisted positions, ref-counting and payload checks.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { channelName, type RtEnvelope } from '@cp/domain';
import { State } from 'centrifuge';
import { createMMKV } from 'react-native-mmkv';

import { attachAppStatePolicy, BACKGROUND_DISCONNECT_MS, createRealtimeClient } from '../client';
import type { RealtimeClient } from '../client';
import { createRecoveryStore, type RecoveryStore } from '../recovery-store';
import { envelope, startCentrifugo, type CentrifugoHarness } from '../test-support/centrifugo';
import { lifecycle, sleep, waitUntil } from '../test-support/lifecycle';

let centrifugo: CentrifugoHarness;
const clients: RealtimeClient[] = [];

beforeAll(async () => {
  centrifugo = await startCentrifugo();
}, 240_000);

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await centrifugo?.stop();
});

function open(uid: string, positions: RecoveryStore = freshPositions()): RealtimeClient {
  const client = createRealtimeClient({
    uid,
    url: centrifugo.wsUrl,
    getToken: () => Promise.resolve(centrifugo.token(uid)),
    positions,
  });
  clients.push(client);
  return client;
}

function freshPositions(): RecoveryStore {
  return createRecoveryStore(createMMKV({ id: `rt-${randomUUID()}` }));
}

function recorder() {
  const events: RtEnvelope[] = [];
  let resets = 0;
  let subscribed = 0;
  return {
    events,
    resets: () => resets,
    subscribed: () => subscribed,
    handlers: {
      onEvent: (event: RtEnvelope) => events.push(event),
      onChannelReset: () => (resets += 1),
      onSubscribed: () => (subscribed += 1),
    },
  };
}

async function publishAll(channel: string, count: number, type = 'crew.updated') {
  const sent = [];
  for (let index = 0; index < count; index += 1) {
    const event = envelope(type, { n: index });
    await centrifugo.publish(channel, event);
    sent.push(event.id);
  }
  return sent;
}

describe('realtime recovery', () => {
  it('recovers everything published during 2 minutes in the background, each event once', async () => {
    const uid = randomUUID();
    const crewId = randomUUID();
    const channel = channelName('crew', crewId);
    const app = lifecycle();
    const client = open(uid);
    attachAppStatePolicy(client, app);
    const seen = recorder();
    client.channels.acquire('crew', crewId, seen.handlers);
    client.connect();
    await waitUntil(() => seen.subscribed() === 1, 10_000, 'first subscribe');

    const before = await publishAll(channel, 3);
    await waitUntil(() => seen.events.length === 3, 5000, 'live events');

    app.emit('background');
    const backgroundedAt = Date.now();
    await waitUntil(() => client.centrifuge.state === State.Disconnected, 40_000, 'disconnect');
    expect(Date.now() - backgroundedAt).toBeGreaterThanOrEqual(BACKGROUND_DISCONNECT_MS - 100);

    const missed = await publishAll(channel, 5);
    // The relay may deliver the same outbox row twice (at-least-once): same envelope id.
    const replayed = before[1];
    await centrifugo.publish(channel, { ...envelope('crew.updated', { n: 1 }), id: replayed });
    await sleep(Math.max(0, backgroundedAt + 120_000 - Date.now()));

    app.emit('active');
    await waitUntil(() => seen.subscribed() === 2, 10_000, 'resubscribe');
    await waitUntil(() => seen.events.length >= 8, 5000, 'recovered events');
    await sleep(500);

    expect(seen.events.map((event) => event.id)).toEqual([...before, ...missed]);
    expect(seen.resets()).toBe(0);
  }, 200_000);

  it('fires the reset callback when more was missed than the channel history holds', async () => {
    const uid = randomUUID();
    const tripId = randomUUID();
    const channel = channelName('trip_dayof', tripId);
    const client = open(uid);
    const seen = recorder();
    client.channels.acquire('trip_dayof', tripId, seen.handlers);
    client.connect();
    await waitUntil(() => seen.subscribed() === 1, 10_000, 'first subscribe');
    await publishAll(channel, 1, 'dayof.updated');
    await waitUntil(() => seen.events.length === 1, 5000, 'live event');

    client.disconnect();
    // trip_dayof keeps 50 publications; 60 overflows it.
    await publishAll(channel, 60, 'dayof.updated');
    client.connect();

    await waitUntil(() => seen.resets() === 1, 10_000, 'reset');
    expect(seen.subscribed()).toBe(2);
  }, 60_000);

  it('resumes from the persisted position after a restart, and resets on a new epoch', async () => {
    const uid = randomUUID();
    const crewId = randomUUID();
    const channel = channelName('crew', crewId);
    const positions = freshPositions();

    const first = open(uid, positions);
    const firstSeen = recorder();
    const release = first.channels.acquire('crew', crewId, firstSeen.handlers);
    first.connect();
    await waitUntil(() => firstSeen.subscribed() === 1, 10_000, 'first subscribe');
    await publishAll(channel, 2);
    await waitUntil(() => firstSeen.events.length === 2, 5000, 'live events');
    release();
    first.disconnect();

    const missed = await publishAll(channel, 3);
    const restarted = open(uid, positions);
    const restartedSeen = recorder();
    restarted.channels.acquire('crew', crewId, restartedSeen.handlers);
    restarted.connect();
    await waitUntil(() => restartedSeen.events.length >= 3, 10_000, 'recovered after restart');
    await sleep(300);
    expect(restartedSeen.events.map((event) => event.id)).toEqual(missed);
    expect(restartedSeen.resets()).toBe(0);
    restarted.disconnect();

    const stored = positions.get(channel);
    expect(stored?.offset).toBeGreaterThanOrEqual(5);
    positions.set(channel, { offset: stored?.offset ?? 0, epoch: 'from-another-stream' });
    const stale = open(uid, positions);
    const staleSeen = recorder();
    stale.channels.acquire('crew', crewId, staleSeen.handlers);
    stale.connect();
    await waitUntil(() => staleSeen.resets() === 1, 10_000, 'epoch reset');
  }, 60_000);
});

describe('channel registry', () => {
  it('shares one subscription between holders and drops it after the last release', async () => {
    const uid = randomUUID();
    const crewId = randomUUID();
    const channel = channelName('crew', crewId);
    const client = open(uid);
    const a = recorder();
    const b = recorder();
    const releaseA = client.channels.acquire('crew', crewId, a.handlers);
    const subscription = client.channels.subscription('crew', crewId);
    const releaseB = client.channels.acquire('crew', crewId, b.handlers);
    expect(client.channels.subscription('crew', crewId)).toBe(subscription);
    client.connect();
    await waitUntil(() => a.subscribed() === 1 && b.subscribed() === 1, 10_000, 'subscribe');

    releaseA();
    await publishAll(channel, 1);
    await waitUntil(() => b.events.length === 1, 5000, 'event to remaining holder');
    expect(a.events).toHaveLength(0);
    expect(subscription?.state).toBe('subscribed');

    releaseB();
    expect(client.channels.subscription('crew', crewId)).toBeUndefined();
    expect(client.centrifuge.getSubscription(channel)).toBeNull();
    expect(client.channels.activeChannels()).toEqual([]);
  }, 30_000);

  it('delivers only owner-channel events whose data matches their type', async () => {
    const uid = randomUUID();
    const client = open(uid);
    const seen = recorder();
    client.channels.acquire('user', uid, seen.handlers);
    client.connect();
    await waitUntil(() => seen.subscribed() === 1, 10_000, 'subscribe');

    const channel = channelName('user', uid);
    await centrifugo.publish(channel, envelope('cmd.result', { op_id: 'not-a-uuid' }));
    await centrifugo.publish(channel, { type: 'cmd.result' });
    const valid = envelope('cmd.result', {
      op_id: randomUUID(),
      status: 'applied',
      code: null,
      result_ref: null,
    });
    await centrifugo.publish(channel, valid);
    await waitUntil(() => seen.events.length === 1, 5000, 'valid event');
    await sleep(300);
    expect(seen.events.map((event) => event.id)).toEqual([valid.id]);
  }, 30_000);
});
