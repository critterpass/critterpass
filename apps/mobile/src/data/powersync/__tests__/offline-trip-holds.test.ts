/**
 * Offline trip holds over the real Node database: the trips under way or starting within the
 * offline window stay subscribed with no screen open, a trip moving into the window is picked up,
 * and trips outside it are left to the screens that show them.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { waitFor } from '@testing-library/react-native';

import { startOfflineTripHolds } from '../offline-trip-holds';
import { openTestLocalFirst, type TestLocalFirst } from '../test-support/local-first-fixture';
import { removeDir } from '../test-support/open-node-database';
import { TRIP_STREAMS } from '../use-trip-streams';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

const TODAY = '2026-10-05';
const LIVE = '0199a6f0-0000-7000-8000-00000000e001';
const TOMORROW = '0199a6f0-0000-7000-8000-00000000e002';
const LATER = '0199a6f0-0000-7000-8000-00000000e003';
const ENDED = '0199a6f0-0000-7000-8000-00000000e004';
const VOTING = '0199a6f0-0000-7000-8000-00000000e005';
const CREW = '0199a6f0-0000-7000-8000-00000000c001';

let stack: TestLocalFirst | null = null;
let stop: (() => void) | null = null;

afterEach(async () => {
  stop?.();
  stop = null;
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function insertTrip(
  db: TestLocalFirst['db'],
  id: string,
  status: string,
  start: string,
  end: string,
): Promise<void> {
  await db.execute(
    'INSERT INTO trips (id, crew_id, status, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
    [id, CREW, status, start, end],
  );
}

/** The explicitly subscribed trip streams, by name and trip, as the core client reports them. */
function subscribed(db: TestLocalFirst['db']): string[] {
  return (db.currentStatus.syncStreams ?? [])
    .filter((stream) => stream.subscription.hasExplicitSubscription)
    .map(
      (stream) =>
        `${stream.subscription.name}:${String(stream.subscription.parameters?.['trip_id'])}`,
    )
    .sort();
}

function streamsOf(...tripIds: string[]): string[] {
  return tripIds.flatMap((id) => TRIP_STREAMS.map((name) => `${name}:${id}`)).sort();
}

describe('offline trip holds', () => {
  it('holds the live and imminent trips with no screen open, and picks up a trip that moves in', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db } = stack;
    await insertTrip(db, LIVE, 'in_trip', '2026-10-03', '2026-10-07');
    await insertTrip(db, TOMORROW, 'confirmed', '2026-10-06', '2026-10-09');
    await insertTrip(db, LATER, 'confirmed', '2026-10-20', '2026-10-24');
    await insertTrip(db, ENDED, 'in_trip', '2026-09-20', '2026-09-24');
    await insertTrip(db, VOTING, 'voting', '2026-10-05', '2026-10-08');
    stop = startOfflineTripHolds(db, () => TODAY);
    await waitFor(() => expect(subscribed(db)).toEqual(streamsOf(LIVE, TOMORROW)));
    await db.execute('UPDATE trips SET start_date = ? WHERE id = ?', ['2026-10-07', LATER]);
    await waitFor(() => expect(subscribed(db)).toEqual(streamsOf(LIVE, TOMORROW, LATER)));
  });
});
