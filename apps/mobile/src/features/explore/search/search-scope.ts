/**
 * Where a search looks, from how it was opened: the scope line under the field ("IN THIS AREA",
 * "FOR DAY 3 · WED", "NEAR TIRTA EMPUL") and the point it measures from.
 */
import { t } from '@lingui/core/macro';

import type { PlaceCandidate } from '@/data/places/match-places';

import type { SearchParams } from './routes';
import type { SearchTrip } from './use-search-trip';

export function parseNear(value: string | undefined): { lat: number; lng: number } | null {
  if (value === undefined) return null;
  const [lat, lng] = value.split(',').map(Number);
  return lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)
    ? null
    : { lat, lng };
}

export function scopeLabel(
  props: SearchParams,
  trip: SearchTrip,
  place: string | null,
): string | null {
  switch (props.scope) {
    case 'map':
      return t({ id: 'search.scope.map', message: 'In this area' });
    case 'day': {
      const day = trip.days.find((entry) => entry.id === props.dayId);
      if (day === undefined) return null;
      const no = day.dayNo;
      const weekday = day.weekday;
      return weekday === null
        ? t({ id: 'search.scope.dayNo', message: `For day ${no}` })
        : t({ id: 'search.scope.day', message: `For day ${no} · ${weekday}` });
    }
    case 'place':
      return place === null ? null : t({ id: 'search.scope.place', message: `Near ${place}` });
    case 'explore':
    case undefined:
      return null;
  }
}

/** A search row for a place known only by its id. */
export function poiRef(poiId: string): PlaceCandidate {
  return {
    id: poiId,
    poiId,
    name: '',
    nameLocal: null,
    category: null,
    lat: null,
    lng: null,
    tags: [],
    source: 'server',
  };
}
