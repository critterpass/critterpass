/**
 * Whose free time the next gap counts, over the real local database: the people holding a seat on
 * the trip. A crewmate who dropped out, or one still waiting for a seat, is not free with the crew.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { SEAT_HOLDERS, SEAT_ME, SEATS_TRIP, seedSeats } from '@/data/trips/test-support/seed-seats';

import { useNextGap } from '../use-next-gap';

jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const VERSION = '0199a6f0-0000-7000-8000-00000005f001';

describe('the people of the next gap', () => {
  it('are the people holding a seat, read from their answers as they sync', async () => {
    stack = await openTestLocalFirst({ uid: SEAT_ME });
    await seedSeats(stack.db);
    await stack.db.execute('UPDATE trips SET current_version_id = ? WHERE id = ?', [
      VERSION,
      SEATS_TRIP,
    ]);
    // A day far ahead with one morning stop for everyone: the afternoon is free.
    await stack.db.execute(
      `INSERT INTO plan_days (id, version_id, trip_id, day_no, date)
       VALUES ('day-1', ?, ?, 1, '2099-03-02')`,
      [VERSION, SEATS_TRIP],
    );
    await stack.db.execute(
      `INSERT INTO plan_items (id, stable_id, version_id, day_id, category, starts_at, ends_at,
         attendee_ids, custom_place)
       VALUES ('item-1', 'stop-1', ?, 'day-1', 'sight', '2099-03-02T02:00:00Z',
         '2099-03-02T04:00:00Z', '[]', '{"name":"Market","lat":16.06,"lng":108.22}')`,
      [VERSION],
    );
    const { result } = await renderHook(() => useNextGap(SEATS_TRIP), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current.gap).not.toBeNull());
    expect([...(result.current.gap?.gap.who_free ?? [])].sort()).toEqual([...SEAT_HOLDERS].sort());
  });
});
