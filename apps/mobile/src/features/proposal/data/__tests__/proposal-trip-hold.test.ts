/**
 * A proposal opened before it is on the phone, over the real Node database: it holds only the
 * trip its notice names, narrowing to that trip when the notice syncs after the screen opened,
 * and holds the open trips only while no notice names one.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { TRIP_STREAMS } from '@/data/powersync/use-trip-streams';

import { holdProposalTrip } from '../proposal';

jest.mock('@shopify/react-native-skia', () =>
  jest.requireActual<object>('@/ui/test-support/skia-double'),
);
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

const CREW = '0199a6f0-0000-7000-8000-00000000c001';
const PROPOSED = '0199a6f0-0000-7000-8000-00000000e001';
const REVIEW = '0199a6f0-0000-7000-8000-00000000e002';
const CONFIRMED = '0199a6f0-0000-7000-8000-00000000e003';
const PROPOSAL = '0199a6f0-0000-7000-8000-00000000f001';
const OTHER_PROPOSAL = '0199a6f0-0000-7000-8000-00000000f002';

let stack: TestLocalFirst | null = null;
let stop: (() => void) | null = null;

afterEach(async () => {
  stop?.();
  stop = null;
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function seedTrips(db: TestLocalFirst['db']): Promise<void> {
  for (const [id, status] of [
    [PROPOSED, 'proposed'],
    [REVIEW, 'draft_review'],
    [CONFIRMED, 'confirmed'],
  ] as const) {
    await db.execute('INSERT INTO trips (id, crew_id, status) VALUES (?, ?, ?)', [
      id,
      CREW,
      status,
    ]);
  }
}

async function insertNotice(
  db: TestLocalFirst['db'],
  id: string,
  tripId: string,
  deepLink: string,
): Promise<void> {
  await db.execute(
    'INSERT INTO notifications (id, trip_id, deep_link, created_at) VALUES (?, ?, ?, ?)',
    [id, tripId, deepLink, '2026-10-06T01:00:00Z'],
  );
}

function subscribed(db: TestLocalFirst['db']): string[] {
  return (db.currentStatus.syncStreams ?? [])
    .filter((stream) => stream.subscription.hasExplicitSubscription)
    .map(
      (stream) =>
        `${stream.subscription.name}:${String(stream.subscription.parameters?.['trip_id'])}`,
    )
    .sort();
}

/** Pass-through spy on the real SDK: records each released trip stream. */
function recordReleases(db: TestLocalFirst['db']): string[] {
  const released: string[] = [];
  const syncStream = db.syncStream.bind(db);
  jest.spyOn(db, 'syncStream').mockImplementation((name, params) => {
    const stream = syncStream(name, params);
    const key = `${name}:${String(params?.['trip_id'])}`;
    const subscribe = stream.subscribe.bind(stream);
    stream.subscribe = async (options) => {
      const subscription = await subscribe(options);
      const unsubscribe = subscription.unsubscribe.bind(subscription);
      subscription.unsubscribe = () => {
        released.push(key);
        unsubscribe();
      };
      return subscription;
    };
    return stream;
  });
  return released;
}

function streamsOf(...tripIds: string[]): string[] {
  return tripIds.flatMap((id) => TRIP_STREAMS.map((name) => `${name}:${id}`)).sort();
}

describe('holding a proposal trip', () => {
  it('holds only the trip its notice names', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db } = stack;
    await seedTrips(db);
    await insertNotice(db, '0199a6f0-0000-7000-8000-00000000a001', REVIEW, `/proposal/${PROPOSAL}`);
    stop = holdProposalTrip(db, PROPOSAL);
    await waitFor(() => expect(subscribed(db)).toEqual(streamsOf(REVIEW)));
  });

  it('narrows to the notice trip once the notice syncs', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db } = stack;
    const released = recordReleases(db);
    await seedTrips(db);
    await insertNotice(
      db,
      '0199a6f0-0000-7000-8000-00000000a002',
      CONFIRMED,
      `/proposal/${OTHER_PROPOSAL}`,
    );
    stop = holdProposalTrip(db, PROPOSAL);
    await waitFor(() => expect(subscribed(db)).toEqual(streamsOf(PROPOSED, REVIEW, CONFIRMED)));
    await insertNotice(
      db,
      '0199a6f0-0000-7000-8000-00000000a003',
      PROPOSED,
      `/proposal/${PROPOSAL}/tracker`,
    );
    // The other two are let go as any trip a screen leaves: the last one stays kept, the other goes.
    await waitFor(() => expect([...released].sort()).toEqual(streamsOf(REVIEW)));
    stop();
    stop = null;
    await waitFor(() => expect([...released].sort()).toEqual(streamsOf(REVIEW, CONFIRMED)));
  });
});
