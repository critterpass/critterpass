/**
 * Who the lock-screen offer names, over the real local database: the crew holding a seat, by first
 * name in joining order. Someone who dropped out or is still waiting for a seat is not on the trip.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { SEAT_ME, SEATS_TRIP, seedSeats } from '@/data/trips/test-support/seed-seats';

import { useOfferData } from '../offer-data';

jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('the crew on the lock-screen offer', () => {
  it('is the people holding a seat, read from their answers as they sync', async () => {
    stack = await openTestLocalFirst({ uid: SEAT_ME });
    await seedSeats(stack.db);
    const { result } = await renderHook(() => useOfferData(SEATS_TRIP), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current.facts.crew).toEqual(['Quoc', 'Maya', 'Linh', 'Bao']));
  });
});
