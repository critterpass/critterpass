/**
 * A stop added from a server-found place is named by it on this phone (the place is never in the
 * phone's catalogue), and the plan's own record of a place wins once it arrives.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { rememberPickedPlace } from '../picked-places';
import { placeNamesOf } from '@/data/plan/plan-model';
import { VERSION_PLACES_SQL } from '@/data/plan/queries';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

const VERSION = '0199a3f0-0000-7000-8000-0000000000e1';
const PICKED = '0199a3f0-0000-7000-8000-0000000000f1';
const DRAFTED = '0199a3f0-0000-7000-8000-0000000000f2';

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

describe('names of places picked on this phone', () => {
  it('names a server-found stop from this phone, behind the plan’s own record', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    await stack.db.execute('INSERT INTO itinerary_versions (id, coverage) VALUES (?, ?)', [
      VERSION,
      JSON.stringify({ places: { [DRAFTED]: { name: 'Marble Mountains' } } }),
    ]);
    await rememberPickedPlace(stack.db, PICKED, 'Di sản Văn hóa Thế Giới Mỹ Sơn');
    await rememberPickedPlace(stack.db, DRAFTED, 'An older name');
    const [row] = await stack.db.getAll<{ coverage: string | null; picked: string | null }>(
      VERSION_PLACES_SQL,
      [VERSION],
    );
    const names = placeNamesOf(row?.coverage ?? null, row?.picked ?? null);
    expect(names.get(PICKED)).toBe('Di sản Văn hóa Thế Giới Mỹ Sơn');
    expect(names.get(DRAFTED)).toBe('Marble Mountains');
  });
});
