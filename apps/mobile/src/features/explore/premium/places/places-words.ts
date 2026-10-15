/** The premium places map and list's own words (the places copy module supplies the rest). */
import { t } from '@lingui/core/macro';

import { groupLabel } from '../../places/places-copy';
import { isCategoryGroup, type PlacesFilter } from '../../places/places-model';

export const placesWords = {
  back: () => t({ id: 'explore.premium.places.back', message: 'Back' }),
  search: (place: string, guide: string) =>
    place === ''
      ? t({ id: 'explore.premium.places.searchAny', message: `Find anything, or ask ${guide}` })
      : t({ id: 'explore.premium.places.search', message: `Search ${place}, or ask ${guide}` }),
  findHere: (place: string) =>
    t({ id: 'explore.premium.places.findHere', message: `Find a place in ${place}` }),
  list: () => t({ id: 'explore.premium.places.list', message: 'List' }),
  map: () => t({ id: 'explore.premium.places.map', message: 'Map' }),
  results: (chips: readonly string[]) =>
    chips.length === 0
      ? t({ id: 'explore.premium.places.resultsPlain', message: 'The places from your search' })
      : t({
          id: 'explore.premium.places.results',
          message: `The places for ${chips.join(' · ')}`,
        }),
  showAll: () => t({ id: 'explore.premium.places.showAll', message: 'Show all' }),
  failedTitle: () =>
    t({ id: 'explore.premium.places.failedTitle', message: 'The places didn’t load' }),
  failedLine: () =>
    t({
      id: 'explore.premium.places.failedLine',
      message: 'Nothing is saved on this phone for here yet. Try again with a signal.',
    }),
  retry: () => t({ id: 'explore.premium.places.retry', message: 'Try again' }),
  offlineTitle: () =>
    t({ id: 'explore.premium.places.offlineTitle', message: 'The map needs a signal' }),
  offlineLine: (place: string) =>
    t({
      id: 'explore.premium.places.offlineLine',
      message: `Save ${place} for no signal and the map works anywhere.`,
    }),
  loading: () => t({ id: 'explore.premium.places.loading', message: 'Finding the places' }),
  stay: () => t({ id: 'explore.premium.places.stay', message: 'Stay' }),
  emptyTitle: () => t({ id: 'explore.premium.places.emptyTitle', message: 'Nothing here yet' }),
  emptyLine: () =>
    t({
      id: 'explore.premium.places.emptyLine',
      message: 'Try another filter, or search for a place by name.',
    }),
  hidden: (n: number) =>
    t({ id: 'explore.premium.places.hidden', message: `Hidden (${String(n)})` }),
  showAgain: () => t({ id: 'explore.premium.places.showAgain', message: 'Show again' }),
  filter: (filter: PlacesFilter) => {
    if (filter === 'all') return t({ id: 'explore.premium.places.all', message: 'All' });
    if (filter === 'saved') return t({ id: 'explore.premium.places.saved', message: 'Saved' });
    if (filter === 'plan') return t({ id: 'explore.premium.places.plan', message: 'In the plan' });
    return isCategoryGroup(filter) ? groupLabel(filter) : filter;
  },
};
