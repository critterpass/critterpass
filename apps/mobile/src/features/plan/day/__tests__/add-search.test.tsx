/**
 * The add sheet's search across the phone and the server: the phone's curated places first and
 * the server's open-data places after them, never twice; offline the phone alone; a server failure
 * keeps the phone's rows, and "couldn't search" only when both fail. The server is a recorded
 * answer at the network boundary; the phone's places are a real local database.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import type { PlaceRow } from '../queries';
import {
  mergePlaceRows,
  rankByName,
  searchState,
  useServerPlaceSearch,
  type FetchPlaces,
} from '../server-place-search';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

const DANANG = '0199a3f0-0000-7000-8000-00000000d001';
const row = (id: string, name: string): PlaceRow => ({
  id,
  name,
  category: 'other',
  lat: 15.7,
  lng: 108.1,
});
const SANCTUARY = row('p-sanctuary', 'Di sản Văn hóa Thế Giới Mỹ Sơn');
const CAFE = row('p-cafe', 'Café Mỹ Sơn');
const MUSEUM = row('p-museum', 'Bảo tàng Ký ức Điêu khắc Đá mỹ nghệ Non Nước');

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

describe('merging the phone and the server', () => {
  it('lists the phone first and the server’s other places after, never twice', () => {
    expect(mergePlaceRows([MUSEUM, CAFE], [CAFE, SANCTUARY]).map((r) => r.id)).toEqual([
      'p-museum',
      'p-cafe',
      'p-sanctuary',
    ]);
  });

  it('puts places named after the query before those matching only by address', () => {
    const bar = { name: 'Billabong Bar', nameLocal: null };
    const sanctuary = { name: 'Di sản Văn hóa Thế Giới Mỹ Sơn', nameLocal: 'Thánh địa Mỹ Sơn' };
    expect(rankByName([bar, sanctuary], 'My Son')).toEqual([sanctuary, bar]);
  });

  it('says couldn’t search only when both fail, and keeps rows from whichever answered', () => {
    const local = { loaded: true, failed: false, arriving: false };
    const failedLocal = { loaded: true, failed: true, arriving: false };
    expect(searchState({ rows: 2, local, server: 'failed' }).state).toBe('results');
    expect(searchState({ rows: 0, local: failedLocal, server: 'failed' }).state).toBe('failed');
    expect(searchState({ rows: 0, local: failedLocal, server: 'loading' }).state).toBe('searching');
    expect(searchState({ rows: 1, local: failedLocal, server: 'ready' }).state).toBe('results');
    expect(searchState({ rows: 0, local, server: 'failed' }).state).toBe('none');
  });

  it('waits for the server before calling a search empty, and offline goes by the phone alone', () => {
    const arriving = { loaded: true, failed: false, arriving: true };
    const local = { loaded: true, failed: false, arriving: false };
    expect(searchState({ rows: 0, local, server: 'loading' }).state).toBe('searching');
    expect(searchState({ rows: 0, local: arriving, server: 'ready' }).state).toBe('none');
    expect(searchState({ rows: 0, local: arriving, server: 'offline' }).state).toBe('arriving');
    expect(searchState({ rows: 0, local, server: 'offline' }).state).toBe('none');
    expect(searchState({ rows: 3, local, server: 'loading' })).toEqual({
      state: 'results',
      more: true,
    });
  });
});

describe('the server search', () => {
  it('asks the server once the typing pauses, and not at all offline', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    const asked: string[] = [];
    const fetchPlaces: FetchPlaces = ({ q }) => {
      asked.push(q);
      return Promise.resolve([SANCTUARY, CAFE]);
    };
    const { result, rerender } = await renderHook(
      ({ q }: { q: string }) => useServerPlaceSearch(DANANG, q, fetchPlaces),
      { wrapper: stack.wrapper, initialProps: { q: 'My S' } },
    );
    await rerender({ q: 'My Son' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(asked).toEqual(['My Son']);
    expect(result.current.rows.map((r) => r.id)).toEqual(['p-sanctuary', 'p-cafe']);

    await act(() => stack.network.set(false));
    await rerender({ q: 'My Son Cafe' });
    expect(result.current.status).toBe('offline');
    expect(asked).toEqual(['My Son']);
  });

  it('reports a failure, and answers again on retry', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    let fail = true;
    const fetchPlaces: FetchPlaces = () =>
      fail ? Promise.reject(new Error('502')) : Promise.resolve([SANCTUARY]);
    const { result } = await renderHook(() => useServerPlaceSearch(DANANG, 'My Son', fetchPlaces), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('failed'));
    fail = false;
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.rows.map((r) => r.id)).toEqual(['p-sanctuary']);
  });
});
