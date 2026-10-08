/**
 * A member's savings on the proposal, priced over the real local database with the people holding
 * a seat: a shared cost is split between them only, and someone without a seat pays nothing, so
 * has nothing to save.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { SEAT_KHOA, SEAT_ME, SEATS_TRIP, seedSeats } from '@/data/trips/test-support/seed-seats';

import { useSavings } from '../savings';

jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const OFFERED = ['skip:boat'];

/** A ₫1,200,000 boat for the whole group. */
async function seedBoat(s: TestLocalFirst): Promise<void> {
  await seedSeats(s.db);
  await s.db.execute(
    `INSERT INTO cost_components (id, trip_id, calc_version, component_key, kind, unit, is_shared,
       amount_minor, currency, source, label, seen_at)
     VALUES ('cc-boat', ?, 'v1', 'boat', 'transfer', 'group', 1, 1200000, 'VND', 'estimate',
       'Boat to the island', '2026-09-30T00:00:00Z')`,
    [SEATS_TRIP],
  );
}

describe('savings on the proposal', () => {
  it('split a shared cost between the four people holding a seat', async () => {
    stack = await openTestLocalFirst({ uid: SEAT_ME });
    await seedBoat(stack);
    const { result } = await renderHook(() => useSavings(SEATS_TRIP, SEAT_ME, OFFERED, 'VND'), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({ id: 'skip:boat', deltaMinor: -300000 });
  });

  it('offer nothing to someone who gave their seat up', async () => {
    stack = await openTestLocalFirst({ uid: SEAT_ME });
    await seedBoat(stack);
    const { result } = await renderHook(() => useSavings(SEATS_TRIP, SEAT_KHOA, OFFERED, 'VND'), {
      wrapper: stack.wrapper,
    });
    // Once the rows are read (my own saving shows), there is still none for Khoa.
    const mine = await renderHook(() => useSavings(SEATS_TRIP, SEAT_ME, OFFERED, 'VND'), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(mine.result.current).toHaveLength(1));
    expect(result.current).toEqual([]);
  });
});
