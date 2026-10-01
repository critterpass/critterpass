/**
 * Who takes part in setup, read on the device the way the server counts them: the trip's active
 * crew members less anyone who said no, whether or not they have a participant row yet (a crew
 * trip starts with the organiser as its only participant); a solo trip, its participants only.
 * The skips the steps offer follow from this count, and the server refuses a skip it does not
 * agree with.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { isSkippable } from '@cp/domain';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { DEV, MAYA, RIN, TRIP_ID } from '../../scenes/fixtures';
import { seedKyoto } from '../../test-support/setup-harness';
import { useSetupTrip } from '../setup-trip';

jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function members(s: TestLocalFirst): Promise<readonly string[]> {
  const { result } = await renderHook(() => useSetupTrip(TRIP_ID, s.uid), { wrapper: s.wrapper });
  await waitFor(() => expect(result.current).toBeTruthy());
  return (result.current?.members ?? []).map((member) => member.uid);
}

describe('who takes part in setup', () => {
  it('is the whole active crew when only the organiser has a participant row', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedKyoto(stack);
    await stack.db.execute('DELETE FROM trip_participants WHERE trip_id = ? AND user_id <> ?', [
      TRIP_ID,
      stack.uid,
    ]);
    const uids = await members(stack);
    expect(uids).toHaveLength(6);
    // Six people share rooms: the step is not one the organiser may walk past.
    expect(
      isSkippable('rooms', {
        current: 'rooms',
        crewSize: uids.length,
        isSolo: false,
        datesLocked: true,
        roomCount: 0,
        stayCount: 2,
        mustDoCount: 0,
      }),
    ).toBe(false);
  });

  it('leaves out someone who said no and someone who left the crew', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedKyoto(stack);
    await stack.db.execute(
      "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = ? AND user_id = ?",
      [TRIP_ID, MAYA],
    );
    await stack.db.execute("UPDATE crew_members SET status = 'left' WHERE user_id = ?", [RIN]);
    const uids = await members(stack);
    expect(uids).toHaveLength(4);
    expect(uids).not.toContain(MAYA);
    expect(uids).not.toContain(RIN);
    expect(uids).toContain(DEV);
  });

  it('is the participants alone on a solo trip in a bigger crew', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedKyoto(stack);
    await stack.db.execute('UPDATE trips SET is_solo = 1 WHERE id = ?', [TRIP_ID]);
    await stack.db.execute('DELETE FROM trip_participants WHERE trip_id = ? AND user_id <> ?', [
      TRIP_ID,
      stack.uid,
    ]);
    expect(await members(stack)).toEqual([stack.uid]);
  });
});
