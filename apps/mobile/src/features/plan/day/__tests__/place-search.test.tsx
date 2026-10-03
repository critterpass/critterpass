/**
 * The add sheet's place search on the local-first stack, over a destination's places as they sync:
 * a traveller types a place the way their keyboard writes it, without the local accents.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  testSchema,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { usePlaceSearch } from '../place-search';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

const DANANG = '0199a3f0-0000-7000-8000-00000000d001';
const OTHER = '0199a3f0-0000-7000-8000-00000000d002';

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function withPlaces() {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  const place = (
    id: string,
    destination: string,
    name: string,
    local: string | null,
    status = 'active',
  ) =>
    stack.db.execute(
      `INSERT INTO pois (id, destination_id, name, name_local, category, lat, lng, status)
       VALUES (?, ?, ?, ?, 'sight', 15.76, 108.12, ?)`,
      [id, destination, name, local, status],
    );
  await place(
    '0199a3f0-0000-7000-8000-0000000000a1',
    DANANG,
    'Mỹ Sơn Sanctuary',
    'Thánh địa Mỹ Sơn',
  );
  await place('0199a3f0-0000-7000-8000-0000000000a2', DANANG, 'Marble Mountains', 'Ngũ Hành Sơn');
  await place('0199a3f0-0000-7000-8000-0000000000a3', DANANG, 'My Son Old Gate', null, 'hidden');
  await place('0199a3f0-0000-7000-8000-0000000000a4', OTHER, 'My Son Cafe', null);
  return stack;
}

describe('place search in the add sheet', () => {
  it('finds a place typed without its accents, in the trip destination only', async () => {
    const stack = await withPlaces();
    const { result } = await renderHook(() => usePlaceSearch(DANANG, 'My Son'), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.rows.map((row) => row.name)).toEqual(['Mỹ Sơn Sanctuary']);
  });

  it('matches the local name and words anywhere in it', async () => {
    const stack = await withPlaces();
    const { result } = await renderHook(() => usePlaceSearch(DANANG, 'ngu hanh'), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.rows.map((row) => row.name)).toEqual(['Marble Mountains']);
  });

  it('says the places are still arriving while none of the destination’s are on the phone', async () => {
    const stack = await withPlaces();
    const empty = '0199a3f0-0000-7000-8000-00000000d0ff';
    const { result } = await renderHook(() => usePlaceSearch(empty, 'My Son'), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect([result.current.arriving, result.current.rows]).toEqual([true, []]);
    const { result: known } = await renderHook(() => usePlaceSearch(DANANG, 'karaoke'), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(known.current.loaded).toBe(true));
    expect([known.current.arriving, known.current.rows]).toEqual([false, []]);
  });

  it('tells a failed search apart from no match, reports it, and finds the place on retry', async () => {
    const stack = await withPlaces();
    const report = jest.fn<(error: unknown) => void>();
    await stack.db.execute('DROP VIEW pois');
    const { result } = await renderHook(() => usePlaceSearch(DANANG, 'My Son', report), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect([result.current.loaded, result.current.arriving, result.current.rows]).toEqual([
      true,
      false,
      [],
    ]);
    expect(report).toHaveBeenCalledTimes(1);
    await stack.db.updateSchema(testSchema());
    await act(() => result.current.retry());
    await waitFor(() =>
      expect(result.current.rows.map((row) => row.name)).toEqual(['Mỹ Sơn Sanctuary']),
    );
    expect(result.current.failed).toBe(false);
  });
});
