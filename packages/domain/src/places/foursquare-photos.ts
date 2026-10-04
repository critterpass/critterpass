/**
 * A place's Foursquare photos, kept and shown again (docs/product-decisions.md D24).
 *
 * Foursquare's usage guidelines allow "Photo IDs: unlimited caching (solely to improve the
 * performance of your application)", and Foursquare confirmed to the founder that a photo's image
 * address (`prefix` + size + `suffix`) may be kept with its id. So of one Place Details answer, the
 * photos' ids, addresses, pixel sizes and creation times are stored and nothing else:
 * `foursquareStoredPhotos` is the only reader of an answer for storage, and it reads no other
 * attribute. The stored photos are served by the subject media read (`GET /v1/media`) as assets of
 * source `foursquare`, each with the credit Foursquare requires.
 *
 * This file also holds the one rule for which picture stands for a place (`PLACE_PHOTO_TIERS`).
 */
import { z } from 'zod';

import { MEDIA_SOURCES, mediaAssetSchema } from '../media/media-assets';
import {
  FOURSQUARE_ATTRIBUTION,
  FOURSQUARE_MAX_PHOTOS,
  sizeFoursquarePhoto,
  type FoursquarePhotoParts,
} from './foursquare';

/** A Place Details call that asks for the photos alone (the warm-up; a Premium call all the same). */
export const FOURSQUARE_PHOTO_FIELDS = 'photos';

/** What is kept of one Foursquare photo. */
export interface FoursquareStoredPhoto extends FoursquarePhotoParts {
  readonly photoId: string;
  /** When Foursquare says the photo was added (ISO), when it says. */
  readonly createdAt: string | null;
}

const storedPhotoSchema = z.object({
  fsq_photo_id: z.string().min(1).max(100).optional(),
  id: z.string().min(1).max(100).optional(),
  created_at: z.iso.datetime({ offset: true }).optional().catch(undefined),
  prefix: z
    .string()
    .regex(/^https:\/\//u)
    .max(300),
  suffix: z.string().regex(/^\//u).max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/**
 * The photos to keep from a Place Details answer, in Foursquare's order, at most five: only each
 * photo's id, address parts, pixel size and creation time. Null when the answer has no readable
 * photo list (nothing is known, so what is stored stays); an empty list when the place has none.
 */
export function foursquareStoredPhotos(body: unknown): FoursquareStoredPhoto[] | null {
  const parsed = z.object({ photos: z.array(z.unknown()) }).safeParse(body);
  if (!parsed.success) return null;
  const photos: FoursquareStoredPhoto[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.data.photos) {
    const photo = storedPhotoSchema.safeParse(raw);
    if (!photo.success) continue;
    const photoId = photo.data.fsq_photo_id ?? photo.data.id;
    if (photoId === undefined || seen.has(photoId)) continue;
    seen.add(photoId);
    photos.push({
      photoId,
      prefix: photo.data.prefix,
      suffix: photo.data.suffix,
      width: photo.data.width,
      height: photo.data.height,
      createdAt: photo.data.created_at ?? null,
    });
    if (photos.length === FOURSQUARE_MAX_PHOTOS) break;
  }
  return photos;
}

/** The widths a place photo is offered at: a list tile, a card, and a full-width hero. */
export const FOURSQUARE_IMAGE_WIDTHS = { thumb: 320, card: 640, hero: 1080 } as const;

/** A stored photo's image addresses, smallest first, one per distinct size. */
export function foursquarePhotoImages(
  photo: FoursquarePhotoParts,
): { url: string; w: number; h: number }[] {
  const images = new Map<number, { url: string; w: number; h: number }>();
  for (const maxWidth of Object.values(FOURSQUARE_IMAGE_WIDTHS)) {
    const sized = sizeFoursquarePhoto(photo, maxWidth);
    images.set(sized.width, { url: sized.url, w: sized.width, h: sized.height });
  }
  return [...images.values()].sort((a, b) => a.w - b.w);
}

/** The sources of the subject media read: editorial media, and a place's Foursquare photos. */
export const PLACE_MEDIA_SOURCES = [...MEDIA_SOURCES, 'foursquare'] as const;
export type PlaceMediaSource = (typeof PLACE_MEDIA_SOURCES)[number];

/** `GET /v1/media?include=foursquare` item: an editorial asset or a place's Foursquare photo. */
export const placeMediaAssetSchema = mediaAssetSchema.extend({
  source: z.enum(PLACE_MEDIA_SOURCES),
});
export type PlaceMediaAsset = z.infer<typeof placeMediaAssetSchema>;

export const placeMediaListResponseSchema = z.object({ items: z.array(placeMediaAssetSchema) });
export type PlaceMediaListResponse = z.infer<typeof placeMediaListResponseSchema>;

/** The value of `include` that adds Foursquare photos to the subject media read. */
export const MEDIA_INCLUDE_FOURSQUARE = 'foursquare';

export const FOURSQUARE_PHOTO_CREDIT = 'Powered by Foursquare';
export const FOURSQUARE_LICENCE = 'foursquare-places-api';
export const FOURSQUARE_LICENCE_URL = 'https://foursquare.com/legal/terms/apilicenseagreement/';

/** A stored photo as a media asset of the place, with Foursquare's credit. */
export function foursquarePhotoAsset(row: {
  readonly id: string;
  readonly poiId: string;
  readonly rank: number;
  readonly photo: FoursquarePhotoParts;
}): PlaceMediaAsset {
  return {
    id: row.id,
    kind: 'photo',
    subjects: [`poi:${row.poiId}`],
    rank: row.rank,
    width: row.photo.width,
    height: row.photo.height,
    duration_ms: null,
    colour: null,
    // No placeholder: the image is never fetched by our servers, so the tile shows until it loads.
    blurhash: '',
    images: foursquarePhotoImages(row.photo),
    videos: [],
    credit: FOURSQUARE_PHOTO_CREDIT,
    attribution_required: true,
    author: FOURSQUARE_ATTRIBUTION.name,
    source: 'foursquare',
    source_url: FOURSQUARE_ATTRIBUTION.url,
    licence: FOURSQUARE_LICENCE,
    licence_url: FOURSQUARE_LICENCE_URL,
  };
}

/**
 * Which picture stands for a place, best first: its own Wikimedia Commons photo, a Foursquare
 * photo, a partner's photo of it, then a generic stock photo (shown as "not this place"). A place
 * with none of them keeps its category tile.
 */
export const PLACE_PHOTO_TIERS = ['own', 'foursquare', 'partner', 'generic'] as const;
export type PlacePhotoTier = (typeof PLACE_PHOTO_TIERS)[number];

/** A source that supplies a partner's photos of the place joins here as `partner`. */
const TIER_OF_SOURCE: Readonly<Record<PlaceMediaSource, PlacePhotoTier>> = {
  wikimedia: 'own',
  foursquare: 'foursquare',
  pexels: 'generic',
  pixabay: 'generic',
};

/** The tier of a photo filed under a place; a source this build does not know ranks as generic. */
export function placePhotoTier(source: string): PlacePhotoTier {
  return (TIER_OF_SOURCE as Readonly<Record<string, PlacePhotoTier>>)[source] ?? 'generic';
}

/** A stock photo standing in for the place, never the place itself. */
export function isGenericPlacePhotoSource(source: string): boolean {
  return placePhotoTier(source) === 'generic';
}

/**
 * Puts a media read in the order a place shows its pictures: assets filed under a place sort by
 * tier, and within a tier (and for destination assets) the given order stays. The first asset of
 * a place is then its picture.
 */
export function byPlacePhotoPrecedence<
  T extends { readonly source: string; readonly subjects: readonly string[] },
>(items: readonly T[]): T[] {
  const order = (item: T): number =>
    item.subjects.some((subject) => subject.startsWith('poi:'))
      ? PLACE_PHOTO_TIERS.indexOf(placePhotoTier(item.source))
      : 0;
  return items
    .map((item, index) => ({ item, index, tier: order(item) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.item);
}
