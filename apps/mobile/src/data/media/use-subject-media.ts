/**
 * Editorial media for a subject (`destination:<slug>`), read through the travel-data path with
 * this device's session: the api's answer, else the last good copy offline, so a hero keeps its
 * photo without a connection.
 * With `prefetch`, the subject's first stills (and a video's poster) are saved to the device in the
 * background, so a trip's heroes draw offline before they were ever shown.
 * A read of places also asks for their kept Foursquare photos (`include=foursquare`); those arrive
 * as addresses only and their files are never saved on the device (`isSavableMediaUrl`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer; route paths and wire values. */
import {
  destinationSubject,
  MEDIA_INCLUDE_FOURSQUARE,
  MEDIA_SOURCES,
  placeMediaListResponseSchema,
  type MediaAsset,
  type PlaceMediaAsset,
} from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { isSavableMediaUrl, saveMediaFile } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';

import {
  createTravelDataReader,
  lastGoodCache,
  readThrough,
  useTravelDataReader,
  type Classification,
  type TravelDataReader,
} from '../travel-data/client';
import { query } from '../travel-data/use-travel-read';

/** The still width saved ahead of time: covers a full-width hero on a 3× phone. */
export const PREFETCH_WIDTH_PX = 1242;
const PREFETCH_COUNT = 3;

export interface SubjectMedia {
  /** Ready assets, hero first. Empty while loading, offline without a copy, or when none exist. */
  readonly items: readonly PlaceMediaAsset[];
}

const classify = (): Classification => ({ status: 'ok', seenAt: null });

/**
 * A read that names a place asks for the Foursquare photos kept for it too; a read of destinations
 * alone keeps its path (and its saved last good copy).
 */
export function mediaPath(subject: string): string {
  const places = subject.split(',').some((key) => key.startsWith('poi:'));
  return `/v1/media${query({
    subjects: subject,
    ...(places ? { include: MEDIA_INCLUDE_FOURSQUARE } : {}),
  })}`;
}

/**
 * The photo for a hero slot: the subject's `index`-th asset (wrapping), photos and videos alike
 * (a video shows its poster where it cannot play).
 */
export function heroAt<T>(items: readonly T[], index = 0): T | null {
  if (items.length === 0) return null;
  const at = ((index % items.length) + items.length) % items.length;
  return items[at] ?? null;
}

/** Saves the first stills that may be kept on the device: our own files, never another host's. */
export async function prefetchMedia(items: readonly PlaceMediaAsset[]): Promise<void> {
  const savable = items.filter((media) =>
    media.images.every((image) => isSavableMediaUrl(image.url)),
  );
  for (const media of savable.slice(0, PREFETCH_COUNT)) {
    const still = pickBySize(media.images, PREFETCH_WIDTH_PX);
    if (still !== undefined) await saveMediaFile(media.id, still.url);
  }
}

let sessionReader: TravelDataReader | undefined;

/** The api with this device's session; a provided travel-data reader (tests) wins. */
export function mediaReader(): TravelDataReader {
  sessionReader ??= createTravelDataReader({
    // Loaded on first use: the auth client's native half is not needed until a hero reads.
    sessionHeaders: async () => (await import('../app-session/device-session')).sessionHeaders(),
  });
  return sessionReader;
}

export function useSubjectMedia(
  subject: string | null,
  options: { readonly prefetch?: boolean } = {},
): SubjectMedia {
  const provided = useTravelDataReader();
  const [answer, setAnswer] = useState<{
    path: string;
    items: readonly PlaceMediaAsset[];
  } | null>(null);
  const path = subject === null ? null : mediaPath(subject);
  const prefetch = options.prefetch === true;
  useEffect(() => {
    if (path === null) return undefined;
    const controller = new AbortController();
    void (async () => {
      const state = await readThrough({
        reader: provided ?? mediaReader(),
        cache: lastGoodCache(),
        path,
        schema: placeMediaListResponseSchema,
        classify,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const items = state.status === 'ok' || state.status === 'stale' ? state.data.items : [];
      setAnswer({ path, items });
      if (prefetch && items.length > 0) void prefetchMedia(items);
    })();
    return () => controller.abort();
  }, [path, provided, prefetch]);
  return { items: answer !== null && answer.path === path ? answer.items : NONE };
}

const NONE: readonly PlaceMediaAsset[] = [];

const EDITORIAL: ReadonlySet<string> = new Set(MEDIA_SOURCES);

/** A destination's media is editorial only. */
function isEditorial(item: PlaceMediaAsset): item is MediaAsset {
  return EDITORIAL.has(item.source);
}

/**
 * Several destinations' media in one read, by slug (each slug's assets hero first). An empty list
 * reads nothing.
 */
export function useDestinationsMedia(
  slugs: readonly string[],
): ReadonlyMap<string, readonly MediaAsset[]> {
  const subjects = [...new Set(slugs)].sort().map(destinationSubject);
  const { items } = useSubjectMedia(subjects.length === 0 ? null : subjects.join(','));
  return useMemo(() => {
    const bySlug = new Map<string, MediaAsset[]>();
    for (const item of items.filter(isEditorial)) {
      for (const subject of item.subjects) {
        const slug = subject.slice('destination:'.length);
        bySlug.set(slug, [...(bySlug.get(slug) ?? []), item]);
      }
    }
    return bySlug;
  }, [items]);
}

/** A destination's media by slug; null slug reads nothing. */
export function useDestinationMedia(
  slug: string | null,
  options: { readonly prefetch?: boolean } = {},
): { readonly items: readonly MediaAsset[] } {
  const { items } = useSubjectMedia(slug === null ? null : destinationSubject(slug), options);
  return useMemo(() => ({ items: items.filter(isEditorial) }), [items]);
}
