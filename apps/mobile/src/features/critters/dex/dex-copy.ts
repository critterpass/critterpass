/** The Critterdex's words (3l-2, 3l-8), in the active locale. */
import { plural, t } from '@lingui/core/macro';

import type { DexFilter } from './dex-model';

export function filterLabels(): { value: DexFilter; label: string }[] {
  return [
    { value: 'all', label: t({ id: 'critters.dex.filterAll', message: 'All' }) },
    { value: 'found', label: t({ id: 'critters.dex.filterFound', message: 'Found' }) },
    { value: 'near', label: t({ id: 'critters.dex.filterNear', message: 'Near me' }) },
  ];
}

export function placesLabel(found: number, total: number): string {
  return t({ id: 'critters.dex.places', message: `${found} of ${total} places` });
}

export function comparison(name: string, count: number): string {
  return t({ id: 'critters.dex.comparison', message: `${name} has ${count}` });
}

export function hereNowTitle(place: string): string {
  return t({ id: 'critters.dex.hereNow', message: `Here now · ${place}` });
}

export function formsOf(name: string, found: number, total: number): string {
  return t({ id: 'critters.dex.formsOf', message: `${name} · ${found} of ${total} forms` });
}

export function nextFormHint(tier: string, requirement: string): string {
  return t({ id: 'critters.dex.nextForm', message: `${tier} next: ${requirement}.` });
}

export function legendaryEyebrow(): string {
  return t({ id: 'critters.dex.legendaryOnDates', message: 'Legendary on your dates' });
}

export function legendaryTitle(placeLine: string, span: string): string {
  return t({ id: 'critters.dex.legendaryTitle', message: `${placeLine}, ${span}` });
}

export function homeSetCount(found: number, total: number): string {
  return t({ id: 'critters.dex.homeCount', message: `${found}/${total} · Home set` });
}

export function setCount(found: number, total: number): string {
  return t({ id: 'critters.dex.setCount', message: `${found}/${total} found` });
}

export function rankGroup(from: number, to: number, cities: number | null): string {
  return cities === null
    ? t({ id: 'critters.dex.rankGroup', message: `Rank ${from}–${to}` })
    : t({
        id: 'critters.dex.rankGroupCities',
        message: plural(cities, {
          one: `Rank ${from}–${to} · # city each`,
          other: `Rank ${from}–${to} · # cities each`,
        }),
      });
}

export function rankNumber(rank: number): string {
  return `#${String(rank).padStart(2, '0')}`;
}

export function searchLabel(): string {
  return t({ id: 'critters.dex.search', message: 'Search a place' });
}

export function emptyFound(): { title: string; body: string } {
  return {
    title: t({ id: 'critters.dex.emptyFoundTitle', message: 'Nothing befriended yet' }),
    body: t({
      id: 'critters.dex.emptyFoundBody',
      message: 'Critters only show up where they live. Your first one hatches when you land.',
    }),
  };
}

export function emptyNear(): { title: string; body: string } {
  return {
    title: t({ id: 'critters.dex.emptyNearTitle', message: 'Nobody lives nearby' }),
    body: t({
      id: 'critters.dex.emptyNearBody',
      message: 'No critters within 5 km of you or your trip. Try ALL to see every place.',
    }),
  };
}

export function emptySearch(query: string): { title: string; body: string } {
  return {
    title: t({ id: 'critters.dex.emptySearchTitle', message: `No place called “${query}”` }),
    body: t({
      id: 'critters.dex.emptySearchBody',
      message: 'Search by country or city, like Vietnam or Hội An.',
    }),
  };
}

export function exploreAtHome(): { title: string; body: string } {
  return {
    title: t({ id: 'critters.dex.exploreAtHome', message: 'Explore at home' }),
    body: t({
      id: 'critters.dex.exploreAtHomeBody',
      message: 'Meet your home set’s critters while the app is open. Never in the background.',
    }),
  };
}

export function lockedCell(city: string): string {
  return t({ id: 'critters.dex.locked', message: `Unknown local at ${city}` });
}

export function pendingLabel(): string {
  return t({ id: 'critters.dex.pending', message: 'Checking' });
}

export function backToDex(): string {
  return t({ id: 'critters.dex.back', message: 'Critterdex' });
}

export function homeSetEyebrow(): string {
  return t({ id: 'critters.dex.homeEyebrow', message: 'Home set' });
}

export function dexTitle(): string {
  return t({ id: 'critters.dex.title', message: 'Your Critterdex' });
}
