/**
 * The plain-words answer on the search screen: asks the question once (keyed by it), words the
 * chips from the trip, and opens MAP in the places map's results mode once that is registered.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids and param keys, never copy. */
import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';

import { useScreenHref } from '@/lib/navigation/screen-registry';

import { NoResults } from './no-results';
import { filtersFor } from './plain-filters';
import { PlainSection } from './plain-section';
import { usePlainSearch } from './use-plain-search';
import type { SearchTrip } from './use-search-trip';

export interface PlainBlockProps {
  readonly question: string;
  readonly tripId: string;
  readonly trip: SearchTrip;
  /** "Ubud": where the search looked, for "NOTHING LIKE THAT NEAR UBUD". */
  readonly area: string;
  readonly onOpen: (poiId: string) => void;
  readonly onAdd: (poiId: string) => void;
  readonly onDropPin: () => void;
  readonly onAsk: () => void;
  /** Street addresses for the question, shown under the places or above the ways out. */
  readonly addresses?: ReactNode;
  /** How many chips the question parsed into, once it has been read. */
  readonly onChips?: (count: number) => void;
}

export function PlainBlock(props: PlainBlockProps) {
  const { question, tripId, trip } = props;
  const { state, remove, relax } = usePlainSearch({
    tripId,
    destinationId: trip.destinationId,
    question,
  });
  const { onChips } = props;
  const chipCount = state.parse === 'done' ? state.chips.length : null;
  useEffect(() => {
    if (chipCount !== null) onChips?.(chipCount);
  }, [chipCount, onChips]);
  const map = useScreenHref('7c-1', { tripId, mode: 'results', q: question });
  return (
    <PlainSection
      state={state}
      trip={trip}
      words={{ days: trip.days, placeName: (poiId) => trip.placeNames.get(poiId) ?? null }}
      onRemove={remove}
      onOpen={props.onOpen}
      onAdd={props.onAdd}
      onMap={map === undefined ? undefined : () => router.push(map)}
      after={props.addresses}
      empty={(answer) => (
        <NoResults
          answer={answer}
          area={props.area}
          limitMinutes={state.filters.max_minutes?.minutes ?? null}
          guide={trip.guide}
          guideName={trip.guideName}
          onWayOut={(way) => {
            if (way.kind === 'pin') {
              props.onDropPin();
              return;
            }
            const filters = filtersFor(state.filters, way);
            if (filters !== null) relax(filters);
          }}
          onAsk={props.onAsk}
          addresses={props.addresses}
        />
      )}
    />
  );
}
