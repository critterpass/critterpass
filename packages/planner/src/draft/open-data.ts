/**
 * Open-data places (not curated by our editors) carry no opening hours and no visit length. When a
 * typed must-do names one, it is planned with the hours places of its kind usually keep, so a
 * mountain park is not put on the evening schedule because nothing said it closes. Those hours are
 * marked as a guess: they shape a plain visit, and never overrule the time of day a must-do is
 * held to. Curated places keep what the editors wrote (unknown hours stay unknown).
 */
import type { Hours } from '@cp/domain';

import { defaultDurationMin } from './schedule-day';
import type { DraftPoi } from './types';

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;

const USUAL_HOURS: Readonly<Record<string, readonly [string, string]>> = {
  nature: ['07:00', '17:30'],
  temple_shrine: ['06:00', '18:00'],
  museum: ['08:00', '17:00'],
  market: ['06:00', '19:00'],
  beach: ['05:00', '19:00'],
  shopping: ['09:00', '21:00'],
  nightlife: ['18:00', '24:00'],
  food: ['07:00', '22:00'],
};

/** The hours places of `category` usually keep (eight to six for a kind we have no usual for). */
export function usualHours(category: string): Hours {
  const span = USUAL_HOURS[category] ?? ['08:00', '18:00'];
  return {
    weekly: Object.fromEntries(DAYS.map((day) => [day, [{ start: span[0], end: span[1] }]])),
  };
}

/** An open-data place with the usual hours and visit length of its kind where it has none. */
export function withOpenDataDefaults(poi: DraftPoi): DraftPoi {
  if (poi.editorial) return poi;
  return {
    ...poi,
    ...(poi.hours === null ? { hours: usualHours(poi.category), hoursGuessed: true } : {}),
    durationMin: poi.durationMin > 0 ? poi.durationMin : defaultDurationMin(poi.category),
  };
}
