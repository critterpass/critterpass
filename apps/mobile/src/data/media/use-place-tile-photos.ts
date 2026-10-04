/**
 * Place photos for lists (search results, Ideas, the places list): give it the POI ids of the rows
 * in view and it answers with each place's hero as it arrives, from the session's store. Rows
 * scrolled into view later add their ids; ids already answered are never read again. A place with
 * no asset, or no answer offline, is simply missing: its tile keeps the category's doodle.
 */
import type { PlaceMediaAsset } from '@cp/domain';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PixelRatio, type ImageSourcePropType } from 'react-native';

import { savedStillUri } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';

import { useTravelDataReader } from '../travel-data/client';
import {
  isGenericPlacePhoto,
  placePhoto,
  placePhotosVersion,
  requestPlacePhotos,
  subscribePlacePhotos,
} from './place-photo-store';
import { mediaReader } from './use-subject-media';

/**
 * A place's photo as a tile shows it, whatever its source (Commons, Foursquare, stock, a partner):
 * the image, whether it is the place itself or a generic stand-in, its credit line and where it
 * leads.
 */
export interface PlaceTilePhoto {
  /** What `PlaceThumb`, `PlaceRow` and `PlaceCard` take: spread it onto the tile. */
  readonly tile: {
    readonly photo: ImageSourcePropType;
    /** A photo standing in for the place: the tile marks it as not this place. */
    readonly genericPhoto: boolean;
  };
  /** "Ray in Manila · CC BY 2.0 · Wikimedia Commons": drawn where the surface has room for it. */
  readonly credit: string;
  /** Whether the licence asks for the credit to be shown with the photo. */
  readonly creditRequired: boolean;
  /**
   * Whether the source asks for its credit on every screen its photo shows on (Foursquare), not
   * only on the place page: such a screen draws `credit` once (`screenCredits`).
   */
  readonly creditOnScreen: boolean;
  /** Where the photo leads when its source offers something (a partner's offer); none otherwise. */
  readonly link: string | null;
}

export type PlaceTilePhotos = ReadonlyMap<string, PlaceTilePhoto>;

/** The widest tile in a list (the place card's 92 pt picture). */
const TILE_PT = 92;

/** The still a tile loads: the smallest that covers it, from the device when it was saved. */
export function tilePhoto(asset: PlaceMediaAsset, sizePt = TILE_PT): PlaceTilePhoto | null {
  const still = pickBySize(asset.images, sizePt * PixelRatio.get());
  if (still === undefined) return null;
  return {
    tile: {
      photo: { uri: savedStillUri(asset, still.url) ?? still.url },
      genericPhoto: isGenericPlacePhoto(asset),
    },
    credit: asset.credit,
    creditRequired: asset.attribution_required,
    creditOnScreen: asset.source === 'foursquare',
    // Editorial media (Commons, stock) leads nowhere; a partner's photo carries its offer here.
    link: null,
  };
}

/** Each place's hero by POI id, for the ids given so far. */
export function usePagedPlacePhotos(
  poiIds: readonly string[],
): ReadonlyMap<string, PlaceMediaAsset> {
  const provided = useTravelDataReader();
  const key = [...new Set(poiIds)].sort().join(',');
  const ids = useMemo(() => (key === '' ? [] : key.split(',')), [key]);
  useEffect(() => {
    if (ids.length > 0) requestPlacePhotos(ids, provided ?? mediaReader());
  }, [ids, provided]);
  const version = useSyncExternalStore(subscribePlacePhotos, placePhotosVersion);
  return useMemo(() => {
    const photos = new Map<string, PlaceMediaAsset>();
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

/**
 * For a virtualised list: the list says which places' rows are on screen (`show`), and the photos
 * of every place shown so far come back, read as their rows first come into view.
 */
export function useInViewPlacePhotos(): {
  readonly photos: PlaceTilePhotos;
  readonly show: (poiIds: readonly string[]) => void;
} {
  const [seen, setSeen] = useState<readonly string[]>([]);
  const show = useCallback((poiIds: readonly string[]) => {
    setSeen((before) => {
      const fresh = poiIds.filter((id) => !before.includes(id));
      return fresh.length === 0 ? before : [...before, ...fresh];
    });
  }, []);
  return { photos: usePlaceTilePhotos(seen), show };
}

/**
 * The credits a screen owes for the photos it shows: each distinct credit of a photo whose source
 * asks for it on screen, so a list draws "Powered by Foursquare" once however many photos it has.
 */
export function screenCredits(photos: Iterable<PlaceTilePhoto | null | undefined>): string[] {
  const credits = new Set<string>();
  for (const photo of photos) {
    if (photo?.creditOnScreen === true) credits.add(photo.credit);
  }
  return [...credits];
}
