/**
 * Place photos for lists (search results, Ideas, the places list): give it the POI ids of the rows
 * in view and it answers with each place's hero as it arrives, from the session's store. Rows
 * scrolled into view later add their ids; ids already answered are never read again. A place with
 * no asset, or no answer offline, is simply missing: its tile keeps the category's doodle.
 */
import type { MediaAsset } from '@cp/domain';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { PixelRatio, type ImageSourcePropType } from 'react-native';

import { savedStillUri } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';

import { useTravelDataReader } from '../travel-data/client';
import {
  isStockPhoto,
  placePhoto,
  placePhotosVersion,
  requestPlacePhotos,
  subscribePlacePhotos,
} from './place-photo-store';
import { mediaReader } from './use-subject-media';

/** What a place tile (`PlaceThumb`, `PlaceRow`, `PlaceCard`) takes: spread it onto the tile. */
export interface PlaceTilePhoto {
  readonly photo: ImageSourcePropType;
  /** A stock photo standing in for the place: the tile marks it as not this place. */
  readonly genericPhoto: boolean;
}

export type PlaceTilePhotos = ReadonlyMap<string, PlaceTilePhoto>;

/** The widest tile in a list (the place card's 92 pt picture). */
const TILE_PT = 92;

/** The still a tile loads: the smallest that covers it, from the device when it was saved. */
export function tilePhoto(asset: MediaAsset, sizePt = TILE_PT): PlaceTilePhoto | null {
  const still = pickBySize(asset.images, sizePt * PixelRatio.get());
  if (still === undefined) return null;
  return {
    photo: { uri: savedStillUri(asset, still.url) ?? still.url },
    genericPhoto: isStockPhoto(asset),
  };
}

/** Each place's hero by POI id, for the ids given so far. */
export function usePagedPlacePhotos(poiIds: readonly string[]): ReadonlyMap<string, MediaAsset> {
  const provided = useTravelDataReader();
  const key = [...new Set(poiIds)].sort().join(',');
  const ids = useMemo(() => (key === '' ? [] : key.split(',')), [key]);
  useEffect(() => {
    if (ids.length > 0) requestPlacePhotos(ids, provided ?? mediaReader());
  }, [ids, provided]);
  const version = useSyncExternalStore(subscribePlacePhotos, placePhotosVersion);
  return useMemo(() => {
    const photos = new Map<string, MediaAsset>();
    for (const id of ids) {
      const photo = placePhoto(id);
      if (photo !== null) photos.set(id, photo);
    }
    return photos;
    // The store is read again whenever an answer lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, version]);
}

/** The same, as what the tiles draw. */
export function usePlaceTilePhotos(poiIds: readonly string[]): PlaceTilePhotos {
  const assets = usePagedPlacePhotos(poiIds);
  return useMemo(() => {
    const tiles = new Map<string, PlaceTilePhoto>();
    for (const [id, asset] of assets) {
      const tile = tilePhoto(asset);
      if (tile !== null) tiles.set(id, tile);
    }
    return tiles;
  }, [assets]);
}
