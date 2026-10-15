import { useMemo, useState } from 'react';
import { shownName } from '@cp/domain';
import { fitLine } from '@/data/fit/fit-line';
import { fitForDay } from './trip-day';
import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { excludeLine } from './chip-words';
import type { PlainPlace } from './plain-filters';

import { placeIcon } from './place-icons';
import { kindWord } from './search-rows';
import type { PlainState } from './use-plain-search';
import type { SearchTrip } from './use-search-trip';
import { t } from '@lingui/core/macro';
import type { DoodleName } from '@/ui/premium/icons/doodles/generated';
import { type FitTone } from '@/ui/premium/planning/planning-shapes';

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

/** What a plain-words answer shows: its rows (the louder or further ones once asked for), the
 * plan's note, and the closest places when nothing matched every chip. */
export function usePlainSection(state: PlainState, trip: SearchTrip) {
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
  const close = settled && answer.places.length === 0 && !softShown ? answer.close : null;
  const closeRows = useMemo(
    () => (close === null ? [] : plainRows(close.places, trip, readsLocal)),
    [close, trip, readsLocal],
  );
  const closePhotos = usePlaceTilePhotos(closeRows.map((row) => row.key));
  return {
    answer,
    rows,
    photos,
    note,
    settled,
    close,
    closeRows,
    closePhotos,
    softShown,
    showSoftMisses: () => setSoftShown(true),
    /** Nothing at all matched: the ways out show instead of rows. */
    empty: settled && answer.places.length === 0 && !softShown,
    failed: state.search === 'failed' || state.search === 'offline',
  };
}

export interface PlainRow {
  readonly key: string;
  readonly title: string;
  readonly meta: string | undefined;
  readonly icon: DoodleName;
  readonly fitLine: { readonly text: string; readonly tone: FitTone } | undefined;
  /** Already on a day of the plan: the row says which, and has no +. */
  readonly inPlan?: boolean | undefined;
}
