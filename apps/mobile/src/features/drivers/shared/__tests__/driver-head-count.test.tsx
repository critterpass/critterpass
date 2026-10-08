/**
 * How many people a driver is asked to carry, over the real local database: the people holding a
 * seat on the trip, so a quote is not asked for one passenger when four are going, nor for someone
 * who dropped out.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { SEAT_ME, SEATS_TRIP, seedSeats } from '@/data/trips/test-support/seed-seats';

import { useDriverDays } from '../use-driver-days';

jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('the head count on a driver day', () => {
  it('counts the people holding a seat, read from their answers as they sync', async () => {
    stack = await openTestLocalFirst({ uid: SEAT_ME });
    await seedSeats(stack.db);
    const { result } = await renderHook(() => useDriverDays(SEATS_TRIP), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.people).toBe(4));
  });
});
