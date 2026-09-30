/**
 * The trip streams hook over the real Node database: mounting it subscribes to every trip stream
 * for the trip, and unmounting lets go of them, which starts their TTL.
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

const TRIP = '0199a6f0-0000-7000-8000-00000000d001';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

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
  it('subscribes to every trip stream for the trip with the TTL and releases them on unmount', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db, wrapper } = stack;
    // Pass-through spies on the real SDK: record each subscription and its release.
    const released: string[] = [];
    const ttls: (number | undefined)[] = [];
    const syncStream = db.syncStream.bind(db);
    jest.spyOn(db, 'syncStream').mockImplementation((name, params) => {
      const stream = syncStream(name, params);
      const subscribe = stream.subscribe.bind(stream);
      stream.subscribe = async (options) => {
        ttls.push(options?.ttl);
        const subscription = await subscribe(options);
        const unsubscribe = subscription.unsubscribe.bind(subscription);
        subscription.unsubscribe = () => {
          released.push(name);
          unsubscribe();
        };
        return subscription;
      };
      return stream;
    });
    const view = await renderHook(() => useTripStreams(TRIP), { wrapper });
    await waitFor(() =>
      expect(subscribed(db)).toEqual([...TRIP_STREAMS].sort().map((name) => `${name}:${TRIP}`)),
    );
    expect(ttls).toEqual(TRIP_STREAMS.map(() => TRIP_STREAM_TTL_S));
    expect(released).toEqual([]);
    await view.unmount();
    expect([...released].sort()).toEqual([...TRIP_STREAMS].sort());
  });
});
