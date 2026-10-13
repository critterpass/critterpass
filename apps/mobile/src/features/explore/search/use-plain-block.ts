/**
 * A plain-words question's answer: asks the question once (keyed
 * by it), words the chips from the trip, takes a way out (a wider search, a related kind, a pin)
 * and opens MAP in the places map's results mode once that is registered.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids and param keys, never copy. */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';

import { chipLabel } from './chip-words';
import { filtersFor, type WayOut } from './plain-filters';
import { usePlainSearch } from './use-plain-search';
import type { SearchTrip } from './use-search-trip';

export interface PlainBlockInput {
  readonly question: string;
  readonly tripId: string;
  readonly trip: SearchTrip;
  readonly onDropPin: () => void;
  /** How many chips the question parsed into, once it has been read. */
  readonly onChips?: ((count: number) => void) | undefined;
}

export function usePlainBlock({ question, tripId, trip, onDropPin, onChips }: PlainBlockInput) {
  const { state, remove, relax, retry } = usePlainSearch({
    tripId,
    destinationId: trip.destinationId,
    question,
  });
  const chipCount = state.parse === 'done' ? state.chips.length : null;
  useEffect(() => {
    if (chipCount !== null) onChips?.(chipCount);
  }, [chipCount, onChips]);
  // The places map in results mode: the answer's own places and its chips, as that screen reads.
  const mapRegistered = useScreenHref('7c-1', { tripId }) !== undefined;
  const words = {
    days: trip.days,
    placeName: (poiId: string) => trip.placeNames.get(poiId) ?? null,
  };
  const openMap = (placeIds: readonly string[]) => {
    const href = hrefFor('7c-1', {
      tripId,
      results: placeIds.join(','),
      chips: state.chips.map((chip) => chipLabel(chip, words)).join('|'),
    });
    if (href !== undefined) router.push(href);
  };
  const wayOut = (way: WayOut) => {
    if (way.kind === 'pin') {
      onDropPin();
      return;
    }
    const filters = filtersFor(state.filters, way);
    if (filters !== null) relax(filters);
  };
  return {
    state,
    remove,
    retry,
    words,
    onMap: mapRegistered ? openMap : undefined,
    wayOut,
    limitMinutes: state.filters.max_minutes?.minutes ?? null,
  };
}
