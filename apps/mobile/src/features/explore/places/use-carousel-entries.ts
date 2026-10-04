/**
 * The carousel's cards from the places it shows (7c-2): the first card measured from the stay
 * ("45 min from the villa"), each later one from the card before it ("10 min on", NEXT DOOR within
 * ten minutes of the picked place), today's hours, the savers' faces and the fit line.
 */
import { knownHours, toLocalWallTime } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import type { FitLine } from '@/data/fit/fit-line';
import type { StackMember } from '@/ui/people/AvatarStack';

import { minutesBetween, NEXT_DOOR_MIN } from './label-sync';
import { cardDescription, cardDescriptionOn } from './places-copy';
import type { HubPlace } from './places-model';
import type { CarouselEntry } from './places-carousel';

const WEEKDAY_KEYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const;

/** "Open 08:00–17:00" for today on the place's own clock; undefined without hours. */
export function hoursToday(stored: unknown, tz: string | null, now: Date): string | undefined {
  const hours = knownHours(stored);
  if (hours === null || tz === null) return undefined;
  const local = toLocalWallTime(now, tz);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time, never copy.
  const weekday = WEEKDAY_KEYS[new Date(`${local.date}T12:00:00Z`).getUTCDay()];
  const spans = weekday === undefined ? undefined : hours.weekly[weekday];
  const first = spans?.[0];
  const last = spans?.at(-1);
  if (first === undefined || last === undefined) {
    return t({ id: 'places.card.closedToday', message: 'Closed today' });
  }
  const from = first.start;
  const to = last.end;
  return t({ id: 'places.card.openToday', message: `Open ${from}–${to}` });
}

export interface CarouselEntriesInput {
  readonly carousel: readonly HubPlace[];
  readonly stay: { readonly name: string; readonly at: { lat: number; lng: number } } | null;
  readonly tz: string | null;
  readonly fits: ReadonlyMap<string, FitLine>;
  readonly saversOf: (place: HubPlace) => readonly StackMember[];
}

export function useCarouselEntries(input: CarouselEntriesInput): CarouselEntry[] {
  const { i18n } = useLingui();
  const { carousel, stay, tz, fits, saversOf } = input;
  return useMemo(() => {
    const now = new Date();
    const anchor = carousel[0];
    return carousel.map((place, index): CarouselEntry => {
      const before = index === 0 ? null : carousel[index - 1];
      const description =
        before === null || before === undefined
          ? cardDescription(
              place.category,
              stay === null ? null : minutesBetween(stay.at, place),
              stay?.name ?? null,
            )
          : cardDescriptionOn(place.category, minutesBetween(before, place));
      return {
        id: place.id,
        name: place.name,
        category: place.category,
        description,
        facts: hoursToday(place.hours, tz, now),
        savers: saversOf(place),
        fit: fits.get(place.id),
        nextDoor:
          index > 0 && anchor !== undefined && minutesBetween(anchor, place) <= NEXT_DOOR_MIN,
      };
    });
    // `i18n.locale` re-words the cards when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carousel, stay, tz, fits, saversOf, i18n.locale]);
}
