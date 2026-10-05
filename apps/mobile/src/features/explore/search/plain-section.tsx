/**
 * A plain-words question's whole answer (7d-2, and 7d-4 when it finds nothing): the chips with the
 * plan's note, then the places with their fit lines, or the ways out when there are none.
 */
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { shownName } from '@cp/domain';

import { fitLine } from '@/data/fit/fit-line';

import { fitForDay } from './trip-day';
import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { useTheme } from '@/ui';

import { ChipBlock, excludeLine, type ChipWords } from './chip-row';
import { ClosePlaces, PlainFailed } from './plain-close';
import type { PlainAnswer, PlainPlace } from './plain-filters';
import { PlainResults, type PlainRow } from './plain-results';
import { placeIcon } from './place-icons';
import { kindWord } from './search-rows';
import type { PlainState } from './use-plain-search';
import type { SearchTrip } from './use-search-trip';
import { t } from '@lingui/core/macro';

function metaOf(place: PlainPlace): string | undefined {
  const parts: string[] = [];
  const kind = kindWord(place.category);
  if (kind !== null) parts.push(kind);
  if (place.area !== null) parts.push(place.area);
  if (place.minutes !== null) {
    const minutes = place.minutes.value;
    parts.push(
      place.minutes.mode === 'walk'
        ? t({ id: 'search.plain.walk', message: `${minutes} min walk` })
        : t({ id: 'search.plain.drive', message: `${minutes} min` }),
    );
  }
  if (place.closesAt !== null) {
    const time = place.closesAt;
    parts.push(t({ id: 'search.plain.openTill', message: `Open till ${time}` }));
  }
  return parts.length === 0 ? undefined : parts.join(' · ');
}

export function plainRows(
  places: readonly PlainPlace[],
  trip: SearchTrip,
  /** The reader sees the destination's local names. */
  readsLocal = false,
): PlainRow[] {
  const weekdays = new Map(trip.days.map((day) => [day.dayNo, day.weekday ?? String(day.dayNo)]));
  return places.map((place) => {
    const line = fitLine(fitForDay(place.fit, trip.focusDayId), {
      weekdays,
      tz: trip.tz,
      stopName: (stableId) => trip.itemTitles.get(stableId) ?? null,
    });
    const day = trip.planDays.get(place.id);
    if (day !== undefined) {
      return {
        key: place.id,
        title: shownName(place, readsLocal),
        meta: t({ id: 'search.row.inPlan', message: `In the plan · ${day}` }),
        icon: placeIcon(place.category),
        fitLine: undefined,
        inPlan: true,
      };
    }
    return {
      key: place.id,
      title: shownName(place, readsLocal),
      meta: metaOf(place),
      icon: placeIcon(place.category),
      fitLine: line === null ? undefined : { text: line.text, tone: line.tone },
    };
  });
}

export interface PlainSectionProps {
  readonly state: PlainState;
  readonly trip: SearchTrip;
  readonly words: ChipWords;
  readonly onRemove: (key: string) => void;
  readonly onOpen: (poiId: string) => void;
  readonly onAdd: (poiId: string, name: string) => void;
  /** MAP for the places on screen; absent until the places map is registered. */
  readonly onMap: ((placeIds: readonly string[]) => void) | undefined;
  /** Runs the same search again after one that failed. */
  readonly onRetry?: (() => void) | undefined;
  /** What to show when the answer has no places (the ways out). */
  readonly empty: (answer: PlainAnswer) => ReactNode;
  /** Shown under the places found (street addresses). */
  readonly after?: ReactNode;
}

export function PlainSection(props: PlainSectionProps) {
  const theme = useTheme();
  const { state, trip } = props;
  const [softShown, setSoftShown] = useState(false);
  const readsLocal = useReadsLocalNames(trip.destinationId);
  const answer = state.answer;
  const rows = useMemo(
    () =>
      answer === null
        ? []
        : plainRows(
            softShown ? [...answer.places, ...answer.softMisses] : answer.places,
            trip,
            readsLocal,
          ),
    [answer, softShown, trip, readsLocal],
  );
  const photos = usePlaceTilePhotos(rows.map((row) => row.key));
  const note =
    state.excludeReason === null
      ? null
      : excludeLine(state.excludeReason, trip.days, trip.itemTitles);
  const settled = state.search === 'ready' && answer !== null;
  const onMap = props.onMap;
  const close = settled && answer.places.length === 0 && !softShown ? answer.close : null;
  const closeRows = useMemo(
    () => (close === null ? [] : plainRows(close.places, trip, readsLocal)),
    [close, trip, readsLocal],
  );
  const closePhotos = usePlaceTilePhotos(closeRows.map((row) => row.key));
  // A search that timed out or could not reach the api reads the same to her as one that failed:
  // words and a retry, never "0 places" over an empty page.
  if ((state.search === 'failed' || state.search === 'offline') && props.onRetry !== undefined) {
    return (
      <View style={{ gap: theme.space['20'] }}>
        <PlainFailed onRetry={props.onRetry} />
        {props.after}
      </View>
    );
  }
  return (
    <View style={{ gap: theme.space['20'] }}>
      <ChipBlock
        chips={state.chips}
        words={props.words}
        note={note}
        guide={trip.guide}
        guideName={trip.guideName}
        onRemove={props.onRemove}
      />
      {close !== null ? (
        <ClosePlaces
          rows={closeRows}
          photos={closePhotos}
          dropped={close.dropped}
          chips={state.chips}
          words={props.words}
          onOpen={props.onOpen}
          onAdd={props.onAdd}
          onMap={onMap === undefined ? undefined : () => onMap(closeRows.map((row) => row.key))}
          after={props.after}
        />
      ) : settled && answer.places.length === 0 && !softShown ? (
        props.empty(answer)
      ) : (
        <>
          <PlainResults
            rows={rows}
            photos={photos}
            loading={state.search === 'loading' || state.parse === 'parsing'}
            softMisses={answer?.softMisses.length ?? 0}
            showingSoftMisses={softShown}
            onSoftMisses={() => setSoftShown(true)}
            onOpen={props.onOpen}
            onAdd={props.onAdd}
            onMap={onMap === undefined ? undefined : () => onMap(rows.map((row) => row.key))}
          />
          {props.after}
        </>
      )}
    </View>
  );
}
