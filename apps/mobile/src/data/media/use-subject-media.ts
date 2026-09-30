/**
 * Editorial media for a subject (`destination:<slug>`), read through the travel-data path: the
 * api's answer, else the last good copy offline, so a hero keeps its photo without a connection.
 * With `prefetch`, the subject's first stills (and a video's poster) are saved to the device in the
 * background, so a trip's heroes draw offline before they were ever shown.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer; route paths and wire values. */
import { destinationSubject, mediaListResponseSchema, type MediaAsset } from '@cp/domain';
import { useEffect, useMemo } from 'react';

import { saveMediaFile } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';

import type { Classification } from '../travel-data/client';
import { query, useTravelRead } from '../travel-data/use-travel-read';

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

export function useSubjectMedia(
  subject: string | null,
  options: { readonly prefetch?: boolean } = {},
): SubjectMedia {
  const state = useTravelRead({
    path: subject === null ? null : mediaPath(subject),
    schema: mediaListResponseSchema,
    classify,
  });
  const items = useMemo(
    () => (state.status === 'ok' || state.status === 'stale' ? state.data.items : []),
    [state],
  );
  const prefetch = options.prefetch === true;
  useEffect(() => {
    if (prefetch && items.length > 0) void prefetchMedia(items);
  }, [prefetch, items]);
  return { items };
}

/** A destination's media by slug; null slug reads nothing. */
export function useDestinationMedia(
  slug: string | null,
  options: { readonly prefetch?: boolean } = {},
): SubjectMedia {
  return useSubjectMedia(slug === null ? null : destinationSubject(slug), options);
}
