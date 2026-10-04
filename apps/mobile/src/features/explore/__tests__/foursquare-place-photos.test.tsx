/**
 * A place's kept Foursquare photos in the app: the media read asks for them and reads them, they
 * count as the place itself, the screen owes one credit for them, and their image files are never
 * saved on the device (only ids and addresses may be kept, and those come from the server).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports.
jest.mock('expo-file-system', () => require('@/ui/media/test-support/memory-file-system'));

import { foursquarePhotoAsset, type PlaceMediaAsset } from '@cp/domain';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  isSavableMediaUrl,
  saveMediaFile,
  savedMediaUri,
  savedStillUri,
} from '@/lib/media/media-files';
import { downloads, reset, seed } from '@/ui/media/test-support/memory-file-system';

import { isGenericPlacePhoto, resetPlacePhotos } from '@/data/media/place-photo-store';
import { screenCredits, tilePhoto, usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { mediaPath, prefetchMedia, useSubjectMedia } from '@/data/media/use-subject-media';
import {
  TravelDataReaderProvider,
  type ReaderResponse,
  type TravelDataReader,
} from '@/data/travel-data/client';

const POI = '01a0f303-0000-7000-8000-000000000001';
const OTHER = '01a0f303-0000-7000-8000-000000000002';

/** A kept photo as the api serves it (the address parts are from the recorded Place Details). */
function foursquare(poiId: string, rank = 0): PlaceMediaAsset {
  return foursquarePhotoAsset({
    id: `01a0f4a2-0000-7000-8000-00000000000${String(rank + 1)}`,
    poiId,
    rank,
    photo: {
      prefix: 'https://fastly.4sqi.net/img/general/',
      suffix: '/1368185932_NJqm6f3sjshDYUemD5zEX4ILxcDOpuE8t4zbKc1qHe0.jpg',
      width: 1440,
      height: 1920,
    },
  });
}

function api(items: readonly PlaceMediaAsset[]): TravelDataReader & { readonly paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    getJson(path): Promise<ReaderResponse> {
      paths.push(path);
      // The server adds Foursquare photos only to a read that asks for them.
      const asked = new URLSearchParams(path.slice(path.indexOf('?'))).get('include');
      const body = { items: items.filter((i) => i.source !== 'foursquare' || asked !== null) };
      return Promise.resolve({ status: 200, body });
    },
  };
}

function withReader(reader: TravelDataReader) {
  return ({ children }: { children: ReactNode }) => (
    <TravelDataReaderProvider value={reader}>{children}</TravelDataReaderProvider>
  );
}

beforeEach(() => {
  reset();
  resetPlacePhotos();
});

describe('the media read of a place', () => {
  it('asks for Foursquare photos for places, and leaves a destination read as it was', () => {
    expect(mediaPath(`poi:${POI}`)).toBe(
      `/v1/media?subjects=${encodeURIComponent(`poi:${POI}`)}&include=foursquare`,
    );
    expect(mediaPath('destination:da-nang')).toBe(
      `/v1/media?subjects=${encodeURIComponent('destination:da-nang')}`,
    );
  });

  it('reads an asset of the foursquare source instead of dropping the answer', async () => {
    const reader = api([foursquare(POI)]);
    const view = await renderHook(() => useSubjectMedia(`poi:${POI}`), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(view.result.current.items).toHaveLength(1));
    expect(view.result.current.items[0]).toMatchObject({
      source: 'foursquare',
      credit: 'Powered by Foursquare',
      attribution_required: true,
    });
  });
});

describe('a Foursquare photo on a tile', () => {
  it('is the place itself, loads from its address, and asks for its credit on the screen', async () => {
    const reader = api([foursquare(POI), foursquare(OTHER)]);
    const view = await renderHook(() => usePlaceTilePhotos([POI, OTHER]), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(view.result.current.size).toBe(2));
    const tile = view.result.current.get(POI);
    expect(tile?.tile.genericPhoto).toBe(false);
    expect(tile?.tile.photo).toEqual({ uri: foursquare(POI).images[0]?.url });
    expect(tile?.creditOnScreen).toBe(true);
    // One line for the screen, however many of its photos are Foursquare's.
    expect(screenCredits(view.result.current.values())).toEqual(['Powered by Foursquare']);
    expect(isGenericPlacePhoto({ source: 'pexels' })).toBe(true);
  });

  it('owes the screen nothing for Commons or stock photos', () => {
    const commons = tilePhoto({ ...foursquare(POI), source: 'wikimedia', credit: 'A · CC BY' });
    expect(commons?.creditOnScreen).toBe(false);
    expect(screenCredits([commons, undefined, null])).toEqual([]);
  });
});

describe('Foursquare image files', () => {
  const photo = foursquare(POI);
  const hero = photo.images.at(-1)?.url ?? '';

  it('are never saved: not by a save, and not by the prefetch of a read', async () => {
    expect(isSavableMediaUrl(hero)).toBe(false);
    expect(await saveMediaFile(photo.id, hero)).toBeNull();
    await prefetchMedia([photo, foursquare(POI, 1)]);
    expect(downloads).toEqual([]);
  });

  it('are never read from the device, even where a file of that name exists', () => {
    seed(`file:///docs/media/${photo.id}/${hero.slice(hero.lastIndexOf('/') + 1)}`);
    expect(savedMediaUri(photo.id, hero)).toBeNull();
    expect(savedStillUri(photo, hero)).toBeNull();
    expect(tilePhoto(photo)?.tile.photo).toEqual({ uri: photo.images[0]?.url });
  });

  it('leaves our own media files saved as before', async () => {
    const own = `https://media.critterpass.app/c/media/${photo.id}/1242.webp`;
    expect(isSavableMediaUrl(own)).toBe(true);
    expect(await saveMediaFile(photo.id, own)).not.toBeNull();
    expect(downloads).toEqual([own]);
  });
});
