/* eslint-disable lingui/no-unlocalized-strings -- locale tags, tone names and paths, not UI copy. */
/**
 * What a trip recap shows on the web, from its public projection alone: the words of the ticket
 * and the share card, and the places on the trail. Pure functions, so the page, the card and their
 * tests agree, and neither can say more than the projection carries.
 */
import type { PublicRecap } from '@cp/domain';

import { recapCopy as copy } from '../site/copy/recap';
import type { Translate } from '../site/i18n';

export interface RecapWords {
  readonly eyebrow: string;
  readonly headline: string;
  /** "With Ben and Mai": first names of the travellers who have not hidden themselves. */
  readonly byline: string | null;
  /** Length, crew size, distance and critters, each only when the recap carries it. */
  readonly chips: readonly string[];
  /** "and 3 more places", when the trail is longer than the page lists. */
  readonly morePlaces: string | null;
  readonly pageTitle: string;
  readonly pageDescription: string;
}

function travelMonth(recap: PublicRecap, locale: string): string | null {
  if (recap.travel_month === null) return null;
  const date = new Date(Date.UTC(recap.travel_year ?? 2000, recap.travel_month - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    ...(recap.travel_year === null ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date);
}

/** Whole kilometres, at least 1 once the crew moved at all; null for a trip with no distance. */
function distanceChip(recap: PublicRecap, t: Translate, locale: string): string | null {
  if (recap.distance_m === null || recap.distance_m <= 0) return null;
  const km = new Intl.NumberFormat(locale).format(Math.max(1, Math.round(recap.distance_m / 1000)));
  return t(recap.distance_estimated ? copy.distanceAbout : copy.distance, { km });
}

export function recapWords(recap: PublicRecap, t: Translate, locale = 'en'): RecapWords {
  const place = recap.destination_name;
  const when = travelMonth(recap, locale);
  const headline = place === null ? t(copy.headlineNoPlace) : t(copy.headline, { place });
  const crew =
    recap.travellers === null
      ? null
      : recap.travellers > 1
        ? t(copy.crewOf, { size: recap.travellers })
        : t(copy.solo);
  const chips = [
    recap.days === null ? null : t(copy.days, { days: recap.days }),
    crew,
    distanceChip(recap, t, locale),
    recap.critters_found !== null && recap.critters_found > 0
      ? t(copy.critters, { count: recap.critters_found })
      : null,
  ].filter((chip): chip is string => chip !== null);
  const more = recap.places_count - recap.places.length;
  return {
    eyebrow: when === null ? t(copy.eyebrow) : t(copy.eyebrowWhen, { when }),
    headline,
    byline:
      recap.crew_names.length > 0
        ? t(copy.travelledBy, {
            names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(recap.crew_names),
          })
        : null,
    chips,
    morePlaces: more > 0 ? t(copy.morePlaces, { count: more }) : null,
    pageTitle: t(copy.pageTitle, { headline }),
    pageDescription:
      place === null || recap.days === null
        ? t(copy.pageDescriptionNoPlace)
        : t(copy.pageDescription, { days: recap.days, place }),
  };
}

const PLACE_TONES = ['green', 'orange', 'blue'] as const;

export interface RecapPlaceRow {
  readonly no: number;
  readonly name: string;
  readonly tone: (typeof PLACE_TONES)[number];
}

export function recapPlaceRows(recap: PublicRecap): readonly RecapPlaceRow[] {
  return recap.places.map((place, index) => ({
    no: index + 1,
    name: place.name,
    tone: PLACE_TONES[index % PLACE_TONES.length] ?? 'green',
  }));
}

/** Where "Open in CritterPass" goes: the app's own screen for a recap link, as an `/app/…` path. */
export function recapAppPath(token: string): string {
  return `/app/recap-link/${token}`;
}
