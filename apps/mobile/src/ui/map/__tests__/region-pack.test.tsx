import { act, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  checkRegionPack,
  forgetRegionPacks,
  knownPack,
  packAnswerFromStatus,
  regionTiles,
  regionTilesUrl,
  rememberedPacks,
  useRegionTiles,
  WORLD_SOURCE_URL,
} from '../region-pack';

const LOCAL_FILE = 'file:///documents/cp-regions/bali-v1.pmtiles';
const realFetch = globalThis.fetch;

function answering(status: number) {
  const fetcher = jest.fn<typeof fetch>(() => Promise.resolve({ status } as Response));
  globalThis.fetch = fetcher;
  return fetcher;
}

function failing() {
  const fetcher = jest.fn<typeof fetch>(() =>
    Promise.reject(new TypeError('Network request failed')),
  );
  globalThis.fetch = fetcher;
  return fetcher;
}

beforeEach(() => forgetRegionPacks());
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('regionTiles', () => {
  it('draws the region file on this phone whatever is known about the pack', () => {
    for (const pack of ['checking', 'available', 'missing', 'unknown'] as const) {
      expect(
        regionTiles({ destinationSlug: 'vn-da-lat', localRegionUri: LOCAL_FILE, pack }),
      ).toEqual({ sourceUrl: `pmtiles://${LOCAL_FILE}`, awaited: false });
    }
  });

  it('draws the published pack once it is known to exist', () => {
    const tiles = regionTiles({ destinationSlug: 'bali', localRegionUri: null, pack: 'available' });
    expect(tiles).toEqual({ sourceUrl: `pmtiles://${regionTilesUrl('bali')}`, awaited: false });
    expect(tiles.sourceUrl).toContain('/bali/tiles-v1.pmtiles');
  });

  it('draws only the world tiles and says a map is on its way when there is no pack', () => {
    expect(
      regionTiles({ destinationSlug: 'vn-da-lat', localRegionUri: null, pack: 'missing' }),
    ).toEqual({ sourceUrl: WORLD_SOURCE_URL, awaited: true });
  });

  it('draws the world tiles and says nothing while nobody knows', () => {
    for (const pack of ['checking', 'unknown'] as const) {
      expect(regionTiles({ destinationSlug: 'vn-da-lat', localRegionUri: null, pack })).toEqual({
        sourceUrl: WORLD_SOURCE_URL,
        awaited: false,
      });
    }
  });

  it('draws the world tiles for a trip with no destination', () => {
    expect(regionTiles({ destinationSlug: null, localRegionUri: null, pack: 'checking' })).toEqual({
      sourceUrl: WORLD_SOURCE_URL,
      awaited: false,
    });
  });
});

describe('packAnswerFromStatus', () => {
  it('reads only a clear answer as one', () => {
    expect(packAnswerFromStatus(200)).toBe('available');
    expect(packAnswerFromStatus(206)).toBe('available');
    expect(packAnswerFromStatus(404)).toBe('missing');
    for (const status of [401, 403, 429, 500, 503]) {
      expect(packAnswerFromStatus(status)).toBe('unknown');
    }
  });
});

describe('checkRegionPack', () => {
  it('asks the tiles host once per destination and keeps the answer', async () => {
    const fetcher = answering(404);
    const [first, second] = await Promise.all([
      checkRegionPack('vn-da-lat'),
      checkRegionPack('vn-da-lat'),
    ]);
    expect([first, second]).toEqual(['missing', 'missing']);
    expect(await checkRegionPack('vn-da-lat')).toBe('missing');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(regionTilesUrl('vn-da-lat'));
  });

  it('remembers a pack it found across launches, and never a missing one', async () => {
    answering(200);
    await checkRegionPack('bali');
    answering(404);
    await checkRegionPack('vn-da-lat');
    expect(rememberedPacks().getAllKeys()).toEqual(['bali']);
  });

  it('asks again after a check that failed', async () => {
    failing();
    expect(await checkRegionPack('bali')).toBe('unknown');
    expect(knownPack('bali')).toBeNull();
    answering(200);
    expect(await checkRegionPack('bali')).toBe('available');
  });
});

describe('useRegionTiles', () => {
  it('never asks when the region file is on this phone', async () => {
    const fetcher = answering(404);
    const { result } = await renderHook(() => useRegionTiles('vn-da-lat', LOCAL_FILE));
    expect(result.current).toEqual({ sourceUrl: `pmtiles://${LOCAL_FILE}`, awaited: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('draws a pack remembered from an earlier launch at once, without asking', async () => {
    // What an earlier launch left behind: the slug in the store, nothing answered this launch.
    rememberedPacks().set('bali', true);
    const fetcher = failing();
    const { result } = await renderHook(() => useRegionTiles('bali', null));
    expect(result.current).toEqual({
      sourceUrl: `pmtiles://${regionTilesUrl('bali')}`,
      awaited: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('starts on the world tiles, then draws the pack the host confirms', async () => {
    answering(200);
    const { result } = await renderHook(() => useRegionTiles('kyoto', null));
    await waitFor(() =>
      expect(result.current.sourceUrl).toBe(`pmtiles://${regionTilesUrl('kyoto')}`),
    );
    expect(result.current.awaited).toBe(false);
  });

  it('keeps the world tiles and says a map is on its way when the host has no pack', async () => {
    answering(404);
    const { result } = await renderHook(() => useRegionTiles('vn-da-lat', null));
    await waitFor(() => expect(result.current.awaited).toBe(true));
    expect(result.current.sourceUrl).toBe(WORLD_SOURCE_URL);
  });

  it('says nothing when the check fails', async () => {
    const fetcher = failing();
    const { result } = await renderHook(() => useRegionTiles('vn-da-lat', null));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ sourceUrl: WORLD_SOURCE_URL, awaited: false });
  });

  it('keeps a pack that drew before when a later map opens offline', async () => {
    answering(200);
    await checkRegionPack('iceland');
    const fetcher = failing();
    const { result } = await renderHook(() => useRegionTiles('iceland', null));
    expect(result.current.sourceUrl).toBe(`pmtiles://${regionTilesUrl('iceland')}`);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
