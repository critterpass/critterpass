/**
 * A plain-words question's whole answer (7d-2, and 7d-4 when it finds nothing): the chips with the
 * plan's note, then the places with their fit lines, or the ways out when there are none.
 */
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { fitLine } from '@/data/fit/fit-line';
import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { useTheme } from '@/ui';

import { ChipBlock, excludeLine, type ChipWords } from './chip-row';
import type { PlainAnswer, PlainPlace } from './plain-filters';
import { PlainResults, type PlainRow } from './plain-results';
import { placeIcon } from './place-icons';
import type { PlainState } from './use-plain-search';
import type { SearchTrip } from './use-search-trip';
import { t } from '@lingui/core/macro';

function metaOf(place: PlainPlace): string | undefined {
  const parts: string[] = [];
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

export function plainRows(places: readonly PlainPlace[], trip: SearchTrip): PlainRow[] {
  const weekdays = new Map(trip.days.map((day) => [day.dayNo, day.weekday ?? String(day.dayNo)]));
  return places.map((place) => {
    const line = fitLine(place.fit, {
      weekdays,
      tz: trip.tz,
      stopName: (stableId) => trip.itemTitles.get(stableId) ?? null,
    });
    return {
      key: place.id,
      title: place.name,
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
  readonly onAdd: (poiId: string) => void;
  readonly onMap: (() => void) | undefined;
  /** What to show when the answer has no places (the ways out). */
  readonly empty: (answer: PlainAnswer) => ReactNode;
}

export function PlainSection(props: PlainSectionProps) {
  const theme = useTheme();
  const { state, trip } = props;
  const [softShown, setSoftShown] = useState(false);
  const answer = state.answer;
  const rows = useMemo(
    () =>
      answer === null
        ? []
        : plainRows(softShown ? [...answer.places, ...answer.softMisses] : answer.places, trip),
    [answer, softShown, trip],
  );
  const photos = usePlaceTilePhotos(rows.map((row) => row.key));
  const note =
    state.excludeReason === null
      ? null
      : excludeLine(state.excludeReason, trip.days, trip.itemTitles);
  const settled = state.search === 'ready' && answer !== null;
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
      {settled && answer.places.length === 0 && !softShown ? (
        props.empty(answer)
      ) : (
        <PlainResults
          rows={rows}
          photos={photos}
          loading={state.search === 'loading' || state.parse === 'parsing'}
          softMisses={answer?.softMisses.length ?? 0}
          showingSoftMisses={softShown}
          onSoftMisses={() => setSoftShown(true)}
          onOpen={props.onOpen}
          onAdd={props.onAdd}
          onMap={props.onMap}
        />
      )}
    </View>
  );
}
