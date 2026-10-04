/**
 * Which photo a place card shows: an asset filed under the place itself (`poi:<id>`), never the
 * destination's. A stock asset on a place is a generic one (a similar dish, a beach like it): the
 * content factory files stock under a place only that way, and the card says it is not this place.
 */
import type { MediaAsset } from '@cp/domain';

import { isGenericPlacePhoto } from '@/data/media/place-photo-store';

import { poiSubject } from './format';

/** The hero (first, the read is in rank order) of each place's own assets, by POI id. */
export function photosByPlace(
  items: readonly MediaAsset[],
  poiIds: readonly string[],
): ReadonlyMap<string, MediaAsset> {
  const photos = new Map<string, MediaAsset>();
  for (const id of poiIds) {
    const subject = poiSubject(id);
    const photo = items.find((item) => item.subjects.includes(subject));
    if (photo !== undefined) photos.set(id, photo);
  }
  return photos;
}

/** A stock photo standing in for the place: shown with the "not this place" label. */
export function isGenericPhoto(photo: MediaAsset | null | undefined): boolean {
  return photo !== null && photo !== undefined && isGenericPlacePhoto(photo);
}
