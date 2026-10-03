/**
 * The plain-words answer on the search screen: asks the question once (keyed by it), words the
 * chips from the trip, and opens MAP in the places map's results mode once that is registered.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids and param keys, never copy. */
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useScreenHref } from '@/lib/navigation/screen-registry';

import type { PlainAnswer } from './plain-filters';
import { PlainSection } from './plain-section';
import { usePlainSearch } from './use-plain-search';
import type { SearchTrip } from './use-search-trip';

export interface PlainBlockProps {
  readonly question: string;
  readonly tripId: string;
  readonly trip: SearchTrip;
  readonly onOpen: (poiId: string) => void;
  readonly onAdd: (poiId: string) => void;
  readonly empty?: (answer: PlainAnswer, question: string) => ReactNode;
}

export function PlainBlock({ question, tripId, trip, onOpen, onAdd, empty }: PlainBlockProps) {
  const { state, remove } = usePlainSearch({ tripId, destinationId: trip.destinationId, question });
  const map = useScreenHref('7c-1', { tripId, mode: 'results', q: question });
  return (
    <PlainSection
      state={state}
      trip={trip}
      words={{ days: trip.days, placeName: (poiId) => trip.placeNames.get(poiId) ?? null }}
      onRemove={remove}
      onOpen={onOpen}
      onAdd={onAdd}
      onMap={map === undefined ? undefined : () => router.push(map)}
      empty={(answer) => (empty === undefined ? null : empty(answer, question))}
    />
  );
}
