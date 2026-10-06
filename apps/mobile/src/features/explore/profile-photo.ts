/**
 * A place's photo from its AI profile, as the api's browse and picks carry it for a place with no
 * curated or Foursquare asset: the picture and the page it was found on. Shown the way the place
 * page shows a profile's photos (no licence line on the picture, the pages cited on the place
 * page), and only where the place has no asset of its own. A destination with no curated cover
 * shows a pick's photo, credited with the place it shows and the site it came from.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire keys, ids and addresses, never copy. */
import type { PlaceMediaAsset } from '@cp/domain';

import type { PlaceTilePhoto, PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { MediaView } from '@/lib/media/variants';

/** The `source` of a photo that came from a place's profile, never one of the media sources. */
export const PROFILE_SOURCE = 'place-profile';

export interface ProfilePhoto {
  readonly url: string;
  /** The page the photo was found on. */
  readonly source_page: string;
}

/** A pick's photo standing in as its destination's cover. */
export interface CoverPhoto extends ProfilePhoto {
  readonly poi_id: string;
  readonly name: string;
}

/** A profile photo as the hero and the pick cards draw one (`MediaLayer`). */
export interface ProfileMedia extends MediaView {
  readonly source: typeof PROFILE_SOURCE;
  readonly source_page: string;
}

/** What a pick card or a hero shows: an asset of the media read, or a profile photo. */
export type ShownPhoto = PlaceMediaAsset | ProfileMedia;

/** The stored size of a profile photo (480 wide); the layer covers its slot whatever the size. */
const STORED = { w: 480, h: 360 };

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** A photo off the wire (`{url, source_page}` or the browse's `{url, sourcePage}`), or null. */
export function readProfilePhoto(value: unknown): ProfilePhoto | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Readonly<Record<string, unknown>>;
  const url = text(row['url']);
  if (url === null || !/^https:\/\//u.test(url)) return null;
  return { url, source_page: text(row['source_page']) ?? text(row['sourcePage']) ?? '' };
}

export function readCoverPhoto(value: unknown): CoverPhoto | null {
  const photo = readProfilePhoto(value);
  const row = value as Readonly<Record<string, unknown>> | null;
  const poiId = text(row?.['poi_id']);
  const name = text(row?.['name']);
  return photo === null || poiId === null || name === null
    ? null
    : { ...photo, poi_id: poiId, name };
}

/** The site a page is on ("commons.wikimedia.org"), or null for an address that is not one. */
function siteOf(page: string): string | null {
  const host = /^https?:\/\/([^/?#]+)/u.exec(page)?.[1];
  return host === undefined ? null : host.replace(/^www\./u, '');
}

/** A cover's credit: the place it shows and the site it came from. */
export function coverCredit(cover: CoverPhoto): string {
  const site = siteOf(cover.source_page);
  return site === null ? cover.name : `${cover.name} · ${site}`;
}

/** The photo as a pick card draws it; with a credit, the line shows on the picture (a cover). */
export function profileMedia(
  poiId: string,
  photo: ProfilePhoto,
  credit: string | null = null,
): ProfileMedia {
  return {
    id: `profile-${poiId}`,
    kind: 'photo',
    blurhash: '',
    images: [{ url: photo.url, ...STORED }],
    videos: [],
    credit: credit ?? '',
    attribution_required: credit !== null,
    source: PROFILE_SOURCE,
    source_page: photo.source_page,
  };
}

/** A destination's cover from a pick's photo, credited; null without one. */
export function coverMedia(cover: CoverPhoto | null | undefined): ProfileMedia | null {
  return cover === null || cover === undefined
    ? null
    : profileMedia(cover.poi_id, cover, coverCredit(cover));
}

/** A pick's picture: its own asset where the media read has one, else its profile photo. */
export function pickPhoto(
  poiId: string,
  asset: PlaceMediaAsset | null | undefined,
  photo: ProfilePhoto | null | undefined,
): ShownPhoto | null {
  if (asset !== null && asset !== undefined) return asset;
  return photo === null || photo === undefined ? null : profileMedia(poiId, photo);
}

/** The photo as a list row or a map card draws it: the place itself, with no line owed on screen. */
export function profileTile(photo: ProfilePhoto): PlaceTilePhoto {
  return {
    tile: { photo: { uri: photo.url }, genericPhoto: false },
    credit: '',
    creditRequired: false,
    creditOnScreen: false,
    link: null,
  };
}

/**
 * The tiles of a list: each place's own asset where the media read has one, else its profile
 * photo, so a place whose photos live in its profile never keeps the category doodle.
 */
export function withProfileTiles(
  tiles: PlaceTilePhotos,
  photos: ReadonlyMap<string, ProfilePhoto>,
): PlaceTilePhotos {
  if (photos.size === 0) return tiles;
  const all = new Map<string, PlaceTilePhoto>();
  for (const [id, photo] of photos) all.set(id, profileTile(photo));
  for (const [id, tile] of tiles) all.set(id, tile);
  return all;
}
