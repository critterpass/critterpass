/**
 * Who a booking can be for, over the real local database: the people holding a seat on the trip,
 * in joining order. A crewmate who dropped out, or one still waiting for a seat, is not travelling.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { SEAT_HOLDERS, SEAT_ME, SEATS_TRIP, seedSeats } from '@/data/trips/test-support/seed-seats';

import { useWalletContext } from '../use-wallet-context';

jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('the travellers the wallet offers', () => {
  it('are the people holding a seat, read from their answers as they sync', async () => {
    stack = await openTestLocalFirst({ uid: SEAT_ME });
    await seedSeats(stack.db);
    const { result } = await renderHook(() => useWalletContext(), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.trip?.id).toBe(SEATS_TRIP);
    await waitFor(() => expect(result.current.travellerIds).toEqual(SEAT_HOLDERS));
  });
});
