/**
 * The trip streams hook over the real Node database: mounting it subscribes to every trip stream
 * for the trip; letting go keeps the trip for one more trip, and only then releases its streams,
 * which starts their TTL. Every held trip costs the sync connection parameter results, so the
 * phone must never pile up trips it no longer shows.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import { openTestLocalFirst, type TestLocalFirst } from '../test-support/local-first-fixture';
import { removeDir } from '../test-support/open-node-database';
import { TRIP_STREAM_TTL_S, TRIP_STREAMS, useTripStreams } from '../use-trip-streams';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

const TRIP_A = '0199a6f0-0000-7000-8000-00000000d001';
const TRIP_B = '0199a6f0-0000-7000-8000-00000000d002';
const TRIP_C = '0199a6f0-0000-7000-8000-00000000d003';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

interface Recorded {
  readonly subscribed: string[];
  readonly released: string[];
  readonly ttls: (number | undefined)[];
}

/** Pass-through spies on the real SDK: record each subscription, its TTL and its release. */
function record(db: TestLocalFirst['db']): Recorded {
  const log: Recorded = { subscribed: [], released: [], ttls: [] };
  const syncStream = db.syncStream.bind(db);
  jest.spyOn(db, 'syncStream').mockImplementation((name, params) => {
    const stream = syncStream(name, params);
    const key = `${name}:${String(params?.['trip_id'])}`;
    const subscribe = stream.subscribe.bind(stream);
    stream.subscribe = async (options) => {
      log.ttls.push(options?.ttl);
      log.subscribed.push(key);
      const subscription = await subscribe(options);
      const unsubscribe = subscription.unsubscribe.bind(subscription);
      subscription.unsubscribe = () => {
        log.released.push(key);
        unsubscribe();
      };
      return subscription;
    };
    return stream;
  });
  return log;
}

function streamsOf(tripId: string): string[] {
  return TRIP_STREAMS.map((name) => `${name}:${tripId}`).sort();
}

/** The explicitly subscribed streams, by name and trip, as the core client reports them. */
function subscribed(db: TestLocalFirst['db']) {
  return (db.currentStatus.syncStreams ?? [])
    .filter((stream) => stream.subscription.hasExplicitSubscription)
    .map(
      (stream) =>
        `${stream.subscription.name}:${String(stream.subscription.parameters?.['trip_id'])}`,
    )
    .sort();
}

describe('the trip streams hook', () => {
  it('subscribes to every trip stream for the trip with the TTL', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db, wrapper } = stack;
    const log = record(db);
    await renderHook(() => useTripStreams(TRIP_A), { wrapper });
    await waitFor(() => expect(subscribed(db)).toEqual(streamsOf(TRIP_A)));
    expect(log.ttls).toEqual(TRIP_STREAMS.map(() => TRIP_STREAM_TTL_S));
    expect(log.released).toEqual([]);
  });

  it('keeps the last trip let go and releases the one before when a third trip opens', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db, wrapper } = stack;
    const log = record(db);
    const view = await renderHook(({ trip }: { trip: string }) => useTripStreams(trip), {
      wrapper,
      initialProps: { trip: TRIP_A },
    });
    await waitFor(() => expect(log.subscribed).toHaveLength(TRIP_STREAMS.length));
    // A to B: A is kept, so coming back to it does not subscribe again.
    await view.rerender({ trip: TRIP_B });
    await waitFor(() => expect(log.subscribed).toHaveLength(2 * TRIP_STREAMS.length));
    expect(log.released).toEqual([]);
    await view.rerender({ trip: TRIP_A });
    expect(log.subscribed).toHaveLength(2 * TRIP_STREAMS.length);
    expect(log.released).toEqual([]);
    // A to C: B was kept and is now the oldest trip nothing holds, so its streams go.
    await view.rerender({ trip: TRIP_C });
    await waitFor(() => expect(log.subscribed).toHaveLength(3 * TRIP_STREAMS.length));
    await waitFor(() => expect([...log.released].sort()).toEqual(streamsOf(TRIP_B)));
    // Unmounting keeps C and releases A.
    await view.unmount();
    await waitFor(() =>
      expect([...log.released].sort()).toEqual([...streamsOf(TRIP_A), ...streamsOf(TRIP_B)].sort()),
    );
  });

  it('subscribes once for screens that share a trip and keeps it while any holds it', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db, wrapper } = stack;
    const log = record(db);
    const first = await renderHook(() => useTripStreams(TRIP_A), { wrapper });
    const second = await renderHook(() => useTripStreams(TRIP_A), { wrapper });
    await waitFor(() => expect(log.subscribed).toHaveLength(TRIP_STREAMS.length));
    await first.unmount();
    const other = await renderHook(() => useTripStreams(TRIP_B), { wrapper });
    await other.unmount();
    const third = await renderHook(() => useTripStreams(TRIP_C), { wrapper });
    await third.unmount();
    // B and C came and went, but a screen still holds A.
    await waitFor(() => expect([...log.released].sort()).toEqual(streamsOf(TRIP_B)));
    await second.unmount();
    expect(log.subscribed.filter((key) => key.endsWith(TRIP_A))).toHaveLength(TRIP_STREAMS.length);
  });
});
