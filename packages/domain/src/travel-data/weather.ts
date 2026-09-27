/**
 * Weather refresh and freshness rules shared by the worker, the api and the app: which plan items
 * need sea conditions, how often each point is refreshed, how points are keyed, and when a stored
 * forecast counts as stale ("CHECKED {time}" with a stale badge, never an invented forecast).
 */

/** Plan item categories that put people on the water (marine forecast + wave watch). */
export const MARINE_ITEM_CATEGORIES = [
  'boat',
  'ferry',
  'snorkel',
  'dive',
  'surf',
  'kayak',
  'cruise',
] as const;

export function isMarineCategory(category: string | null): boolean {
  return category !== null && (MARINE_ITEM_CATEGORIES as readonly string[]).includes(category);
}

/** Default cadence; every point is refreshed at least this often while its trip is active. */
export const WEATHER_REFRESH_MINUTES = 180;
/** Within 48 h of an outdoor plan item at the destination. */
export const WEATHER_REFRESH_NEAR_MINUTES = 60;
/** Sea conditions while a trip with a boat item is under way. */
export const MARINE_REFRESH_LIVE_MINUTES = 15;
export const WEATHER_NEAR_ITEM_HOURS = 48;
/** Weather snapshots are kept this long after their date. */
export const WEATHER_RETENTION_DAYS = 30;

/** A forecast older than twice the default cadence, or whose last refresh failed, is stale. */
export function isWeatherStale(fetchedAt: Date, checkedAt: Date, now: Date): boolean {
  return (
    checkedAt.getTime() > fetchedAt.getTime() ||
    now.getTime() - fetchedAt.getTime() > 2 * WEATHER_REFRESH_MINUTES * 60_000
  );
}

/** Plan-item places share one forecast per 0.1° cell (about 11 km). */
export function gridPointKey(lat: number, lng: number): string {
  return `g:${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export function summitPointKey(name: string): string {
  return `summit:${name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

export const CENTROID_POINT_KEY = 'centroid';
