/**
 * Place photos for long lists: ids are read in chunks of the api's subject limit as rows come into
 * view, an id is never read twice, a place with no asset is simply missing, and a read that gets no
 * answer leaves the rows without photos until they are asked for again.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('expo-file-system', () => require('@/ui/media/test-support/memory-file-system'));

import { mediaListResponseSchema, type MediaAsset } from '@cp/domain';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  TravelDataReaderProvider,
  type ReaderResponse,
  type TravelDataReader,
} from '../../travel-data/client';
import { recorded } from '../../travel-data/test-support/recorded-reader';
import { resetPlacePhotos, SUBJECTS_PER_READ } from '../place-photo-store';
import { tilePhoto, usePagedPlacePhotos, usePlaceTilePhotos } from '../use-place-tile-photos';

const RECORDED = mediaListResponseSchema.parse(recorded('media-da-nang')).items;
const STOCK = RECORDED.find((item) => item.kind === 'photo') ?? RECORDED[0];

const poi = (n: number) => `01a0f303-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** The recorded stock photo, filed under a place the way the api returns a place's asset. */
function filedUnder(id: string, source: MediaAsset['source'] = 'pexels'): MediaAsset {
  if (STOCK === undefined) throw new Error('the recording has no asset');
  return { ...STOCK, id: id.replace('01a0f303', '01a0f4a2'), subjects: [`poi:${id}`], source };
}

interface MediaApi extends TravelDataReader {
  /** The POI ids of each request, in order. */
  readonly reads: string[][];
  online: boolean;
}

/** `GET /v1/media?subjects=…` over a set of places that have an asset. */
function mediaApi(assets: readonly MediaAsset[]): MediaApi {
  const api: MediaApi = {
    reads: [],
    online: true,
    getJson(path): Promise<ReaderResponse> {
      const subjects = (new URLSearchParams(path.slice(path.indexOf('?'))).get('subjects') ?? '')
        .split(',')
        .filter((subject) => subject !== '');
      api.reads.push(subjects.map((subject) => subject.slice('poi:'.length)));
      if (!api.online) return Promise.reject(new TypeError('Network request failed'));
      if (subjects.length > SUBJECTS_PER_READ) return Promise.resolve({ status: 400, body: {} });
      const items = assets.filter((asset) => asset.subjects.some((s) => subjects.includes(s)));
      return Promise.resolve({ status: 200, body: { items } });
    },
  };
  return api;
}

function withReader(reader: TravelDataReader) {
  return ({ children }: { children: ReactNode }) => (
    <TravelDataReaderProvider value={reader}>{children}</TravelDataReaderProvider>
  );
}

const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => poi(from + i));

describe('usePagedPlacePhotos', () => {
  beforeEach(() => resetPlacePhotos());

  it('reads a long list in chunks of the subject limit', async () => {
    const places = ids(1, 45);
    const api = mediaApi(places.map((id) => filedUnder(id)));
    const view = await renderHook(() => usePagedPlacePhotos(places), {
      wrapper: withReader(api),
    });
    await waitFor(() => expect(view.result.current.size).toBe(45));
    expect(api.reads.map((read) => read.length)).toEqual([20, 20, 5]);
    expect(new Set(api.reads.flat()).size).toBe(45);
  });

  it('reads only the rows that newly came into view, and never an id twice', async () => {
    const api = mediaApi(ids(1, 30).map((id) => filedUnder(id)));
    const view = await renderHook(
      ({ visible }: { visible: readonly string[] }) => usePagedPlacePhotos(visible),
      { wrapper: withReader(api), initialProps: { visible: ids(1, 8) } },
    );
    await waitFor(() => expect(view.result.current.size).toBe(8));
    await view.rerender({ visible: ids(5, 8) });
    await waitFor(() => expect(view.result.current.size).toBe(8));
    await view.rerender({ visible: ids(1, 8) });
    expect(view.result.current.size).toBe(8);
    expect(api.reads).toEqual([ids(1, 8), ids(9, 4)]);

    // Another list showing the same places reads nothing.
    const other = await renderHook(() => usePagedPlacePhotos(ids(1, 12)), {
      wrapper: withReader(api),
    });
    expect(other.result.current.size).toBe(12);
    expect(api.reads).toHaveLength(2);
  });

  it('leaves a place with no asset out, and does not ask for it again', async () => {
    const api = mediaApi([filedUnder(poi(1)), filedUnder(poi(3))]);
    const view = await renderHook(
      ({ visible }: { visible: readonly string[] }) => usePagedPlacePhotos(visible),
      { wrapper: withReader(api), initialProps: { visible: ids(1, 3) } },
    );
    await waitFor(() => expect(view.result.current.size).toBe(2));
    expect([...view.result.current.keys()]).toEqual([poi(1), poi(3)]);
    await view.rerender({ visible: ids(1, 4) });
    await waitFor(() => expect(api.reads).toHaveLength(2));
    expect(api.reads[1]).toEqual([poi(4)]);
  });

  it('skips ids that are not a place ref (a dropped pin) instead of failing the chunk', async () => {
    const api = mediaApi([filedUnder(poi(1))]);
    const view = await renderHook(() => usePagedPlacePhotos([poi(1), 'Dropped Pin 1']), {
      wrapper: withReader(api),
    });
    await waitFor(() => expect(view.result.current.size).toBe(1));
    expect(api.reads).toEqual([[poi(1)]]);
  });

  it('keeps the rows without photos offline and reads them once they are asked for again', async () => {
    const api = mediaApi(ids(1, 3).map((id) => filedUnder(id)));
    api.online = false;
    const offline = await renderHook(() => usePagedPlacePhotos(ids(1, 3)), {
      wrapper: withReader(api),
    });
    await waitFor(() => expect(api.reads).toHaveLength(1));
    expect(offline.result.current.size).toBe(0);
    await offline.unmount();

    api.online = true;
    const back = await renderHook(() => usePagedPlacePhotos(ids(1, 3)), {
      wrapper: withReader(api),
    });
    await waitFor(() => expect(back.result.current.size).toBe(3));
  });
});

describe('a tile photo', () => {
  beforeEach(() => resetPlacePhotos());

  it('marks stock under a place as generic and the place’s own Commons photo as real', async () => {
    const api = mediaApi([filedUnder(poi(1), 'pexels'), filedUnder(poi(2), 'wikimedia')]);
    const view = await renderHook(() => usePlaceTilePhotos(ids(1, 3)), {
      wrapper: withReader(api),
    });
    await waitFor(() => expect(view.result.current.size).toBe(2));
    expect(view.result.current.get(poi(1))?.genericPhoto).toBe(true);
    expect(view.result.current.get(poi(2))?.genericPhoto).toBe(false);
    expect(view.result.current.has(poi(3))).toBe(false);
  });

  it('loads the smallest still that covers the tile', () => {
    const asset: MediaAsset = {
      ...filedUnder(poi(1)),
      images: [480, 828, 1242].map((w) => ({
        url: `https://media.test/${String(w)}.webp`,
        w,
        h: w,
      })),
    };
    expect(tilePhoto(asset, 56)?.photo).toEqual({ uri: 'https://media.test/480.webp' });
    expect(tilePhoto({ ...asset, images: [] }, 56)).toBeNull();
  });
});
