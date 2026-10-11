/**
 * The plain-words answer on the search screen: asks the question once (keyed by it), words the
 * chips from the trip, and opens MAP in the places map's results mode once that is registered.
 */
import type { ReactNode } from 'react';

import { NoResults } from './no-results';
import { PlainSection } from './plain-section';
import { usePlainBlock } from './use-plain-block';
import type { SearchTrip } from './use-search-trip';

export interface PlainBlockProps {
  readonly question: string;
  readonly tripId: string;
  readonly trip: SearchTrip;
  /** "Ubud": where the search looked, for "NOTHING LIKE THAT NEAR UBUD". */
  readonly area: string;
  /** The search looked at the whole destination, not around a place. */
  readonly whole?: boolean | undefined;
  readonly onOpen: (poiId: string) => void;
  readonly onAdd: (poiId: string, name: string) => void;
  readonly onDropPin: () => void;
  readonly onAsk: () => void;
  /** Street addresses for the question, shown under the places or above the ways out. */
  readonly addresses?: ReactNode;
  /** How many chips the question parsed into, once it has been read. */
  readonly onChips?: (count: number) => void;
}

export function PlainBlock(props: PlainBlockProps) {
  const { trip } = props;
  const { state, remove, retry, words, onMap, wayOut, limitMinutes } = usePlainBlock(props);
  return (
    <PlainSection
      state={state}
      trip={trip}
      words={words}
      onRetry={retry}
      onRemove={remove}
      onOpen={props.onOpen}
      onAdd={props.onAdd}
      onMap={onMap}
      after={props.addresses}
      empty={(answer) => (
        <NoResults
          answer={answer}
          area={props.area}
          whole={props.whole}
          limitMinutes={limitMinutes}
          guide={trip.guide}
          guideName={trip.guideName}
          onWayOut={wayOut}
          onAsk={props.onAsk}
          addresses={props.addresses}
        />
      )}
    />
  );
}
