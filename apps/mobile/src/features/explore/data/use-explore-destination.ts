/**
 * The destination guide's read (`/v1/explore/destinations/{id}`): month curve, FX chip, the fares
 * from each crew member's home airport for a month (in the viewer's currency, each with when it
 * was seen) and the first-timer picks, with each pick's profile photo by place id and the photo
 * offered as the destination's cover. The last good answer is kept, so the page draws offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { exploreDestinationSchema, type ExploreDestinationWire } from '@cp/domain';

import type { Classification, WireParser } from '@/data/travel-data/client';
import type { ReadState } from '@/data/travel-data/freshness';
import { query, useTravelRead } from '@/data/travel-data/use-travel-read';

import {
  readCoverPhoto,
  readProfilePhoto,
  type CoverPhoto,
  type ProfilePhoto,
} from '../profile-photo';

/** The guide's read with the photos its picks carry. */
export interface ExploreDestinationRead extends ExploreDestinationWire {
  /** Each pick's profile photo, by place id; a pick with none is absent. */
  readonly pick_photos: Readonly<Record<string, ProfilePhoto>>;
  /** A pick's photo for the hero of a destination with no curated cover; null without one. */
  readonly cover: CoverPhoto | null;
}

function photosOf(value: unknown): Record<string, ProfilePhoto> {
  const body = value as { picks?: unknown; pick_photos?: unknown } | null;
  const photos: Record<string, ProfilePhoto> = {};
  // The saved copy holds the photos as parsed; the api's answer holds one on each pick.
  if (typeof body?.pick_photos === 'object' && body.pick_photos !== null) {
    for (const [poiId, raw] of Object.entries(body.pick_photos)) {
      const photo = readProfilePhoto(raw);
      if (photo !== null) photos[poiId] = photo;
    }
  }
  for (const entry of Array.isArray(body?.picks) ? (body.picks as unknown[]) : []) {
    const item = (entry as { item?: { poi_id?: unknown; photo?: unknown } } | null)?.item;
    const photo = readProfilePhoto(item?.photo);
    if (typeof item?.poi_id === 'string' && photo !== null) photos[item.poi_id] = photo;
  }
  return photos;
}

/** The guide's answer (or its saved copy) with the picks' photos; an answer without any is whole. */
export const exploreDestinationReadSchema: WireParser<ExploreDestinationRead> = {
  safeParse(value) {
    const parsed = exploreDestinationSchema.safeParse(value);
    if (!parsed.success) return { success: false };
    return {
      success: true,
      data: {
        ...parsed.data,
        pick_photos: photosOf(value),
        cover: readCoverPhoto((value as { cover?: unknown } | null)?.cover),
      },
    };
  },
};

export interface ExploreDestinationInput {
  /** Destination id or slug; null reads nothing. */
  readonly destination: string | null;
  readonly tripId?: string | undefined;
  /** `YYYY-MM`; the server prices two months out when absent. */
  readonly month?: string | undefined;
}

export function exploreDestinationPath(input: ExploreDestinationInput): string | null {
  if (input.destination === null || input.destination === '') return null;
  return `/v1/explore/destinations/${encodeURIComponent(input.destination)}${query({
    trip_id: input.tripId,
    month: input.month,
  })}`;
}

function classify(data: ExploreDestinationWire): Classification {
  const seen = data.fares.flatMap((fare) => (fare.seen_at === null ? [] : [fare.seen_at]));
  return {
    status: 'ok',
    seenAt: seen.length === 0 ? null : seen.reduce((a, b) => (a > b ? a : b)),
  };
}

export function useExploreDestination(
  input: ExploreDestinationInput,
): ReadState<ExploreDestinationRead> {
  return useTravelRead({
    path: exploreDestinationPath(input),
    schema: exploreDestinationReadSchema,
    classify,
  });
}
