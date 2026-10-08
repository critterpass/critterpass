/**
 * What the places map and list remember for each other: switching between the two is one place
 * seen two ways, so the map comes back where it was looking, on the place that was picked, and the
 * list comes back in the order and at the row it was left on. Held for one trip or destination at
 * a time, in memory only, and let go when the traveller leaves the places for good.
 */
import type { FlashListRef } from '@shopify/flash-list';
import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { SortMode } from './place-groups';

export interface ResumeCamera {
  readonly center: [number, number];
  readonly zoom: number;
  /** The filter and results the camera was framed for: another frame starts afresh. */
  readonly frame: string;
}

export interface PlacesResume {
  readonly sort?: SortMode;
  readonly listOffset?: number;
  readonly camera?: ResumeCamera;
  readonly pickedId?: string | null;
}

let held: { readonly key: string; readonly value: PlacesResume } | null = null;

export function recallPlaces(key: string | undefined): PlacesResume {
  return key !== undefined && held?.key === key ? held.value : {};
}

export function rememberPlaces(key: string | undefined, patch: PlacesResume): void {
  if (key === undefined) return;
  held = { key, value: { ...recallPlaces(key), ...patch } };
}

export function forgetPlaces(key: string | undefined): void {
  if (key !== undefined && held?.key === key) held = null;
}

/** The frame a camera belongs to: the filter, and the search results the map is narrowed to. */
export function frameKey(filter: string, resultChips: readonly string[] | undefined): string {
  return `${filter}|${resultChips?.join('|') ?? ''}`;
}

/**
 * Where the map picks up: the remembered camera and pick, unless the map was opened on a place or
 * for another filter than the one the camera was left on.
 */
export function mapResume(
  key: string | undefined,
  placeId: string | null | undefined,
  frame: string,
): { readonly camera: ResumeCamera | undefined; readonly pickedId: string | null } {
  const { camera, pickedId } = recallPlaces(key);
  if ((placeId ?? null) !== null || camera === undefined || camera.frame !== frame) {
    return { camera: undefined, pickedId: null };
  }
  return { camera, pickedId: pickedId ?? null };
}

/** The list's order and scroll position, kept while the traveller looks at the map. */
export function useListResume<Item>(key: string | undefined) {
  const [sort, setSortState] = useState<SortMode>(() => recallPlaces(key).sort ?? 'fit');
  const [offset] = useState(() => recallPlaces(key).listOffset ?? 0);
  const ref = useRef<FlashListRef<Item>>(null);
  const setSort = useCallback(
    (next: SortMode) => {
      // Another order is another list: it starts at its top.
      rememberPlaces(key, { sort: next, listOffset: 0 });
      setSortState(next);
    },
    [key],
  );
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      rememberPlaces(key, { listOffset: event.nativeEvent.contentOffset.y }),
    [key],
  );
  // Once the rows are drawn, back to the row the list was left on.
  const onLoad = useCallback(() => {
    if (offset > 0) ref.current?.scrollToOffset({ offset, animated: false });
  }, [offset]);
  return { sort, setSort, ref, onScroll, onLoad };
}
