/**
 * Editorial media for a subject (`destination:<slug>`), read through the travel-data path with
 * this device's session: the api's answer, else the last good copy offline, so a hero keeps its
 * photo without a connection.
 * With `prefetch`, the subject's first stills (and a video's poster) are saved to the device in the
 * background, so a trip's heroes draw offline before they were ever shown.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer; route paths and wire values. */
import { destinationSubject, mediaListResponseSchema, type MediaAsset } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { saveMediaFile } from '@/lib/media/media-files';
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
  readonly items: readonly MediaAsset[];
}

const classify = (): Classification => ({ status: 'ok', seenAt: null });

export function mediaPath(subject: string): string {
  return `/v1/media${query({ subjects: subject })}`;
}

/**
 * The photo for a hero slot: the subject's `index`-th asset (wrapping), photos and videos alike
 * (a video shows its poster where it cannot play).
 */
export function heroAt(items: readonly MediaAsset[], index = 0): MediaAsset | null {
  if (items.length === 0) return null;
  const at = ((index % items.length) + items.length) % items.length;
  return items[at] ?? null;
}

export async function prefetchMedia(items: readonly MediaAsset[]): Promise<void> {
  for (const media of items.slice(0, PREFETCH_COUNT)) {
    const still = pickBySize(media.images, PREFETCH_WIDTH_PX);
    if (still !== undefined) await saveMediaFile(media.id, still.url);
  }
}

let sessionReader: TravelDataReader | undefined;

/** The api with this device's session; a provided travel-data reader (tests) wins. */
function mediaReader(): TravelDataReader {
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
  const [answer, setAnswer] = useState<{ path: string; items: readonly MediaAsset[] } | null>(null);
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
        schema: mediaListResponseSchema,
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

const NONE: readonly MediaAsset[] = [];

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
    for (const item of items) {
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
): SubjectMedia {
  return useSubjectMedia(slug === null ? null : destinationSubject(slug), options);
}
