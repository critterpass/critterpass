/**
 * Fare rules shared by the nightly precompute, the fare routes and the app: how old a price may be
 * before it becomes "no recent price", the drop threshold, the month horizon, and the hub airports
 * an origin without data falls back to (labelled "from KUL", never passed off as the origin's own).
 */
import { toLocalWallTime } from '../time/local-schedule';

/** A fare older than this is not shown as a number (docs: "stale >72 h → no recent price"). */
export const FARE_STALE_HOURS = 72;
/** A nightly price at least this much below the previous 7-day minimum is a drop. */
export const FARE_DROP_THRESHOLD_PCT = 10;
export const FARE_DROP_WINDOW_DAYS = 7;
/** Months precomputed ahead, starting with the current one. */
export const FARE_MONTHS_AHEAD = 12;
/** The precompute runs in this zone ("02:00 SGT"); its "night" and observation dates use it too. */
export const FARE_REFRESH_TZ = 'Asia/Singapore';

export interface FareHub {
  readonly iata: string;
  readonly lat: number;
  readonly lng: number;
}

/** Large hubs with deep fare coverage; an origin with no data borrows the nearest one. */
export const FARE_HUBS: readonly FareHub[] = [
  { iata: 'SIN', lat: 1.3644, lng: 103.9915 },
  { iata: 'KUL', lat: 2.7456, lng: 101.7099 },
  { iata: 'BKK', lat: 13.69, lng: 100.7501 },
  { iata: 'SGN', lat: 10.8188, lng: 106.6519 },
  { iata: 'MNL', lat: 14.5086, lng: 121.0194 },
  { iata: 'CGK', lat: -6.1256, lng: 106.6559 },
  { iata: 'HKG', lat: 22.308, lng: 113.9185 },
  { iata: 'TPE', lat: 25.0797, lng: 121.2342 },
  { iata: 'ICN', lat: 37.4602, lng: 126.4407 },
  { iata: 'NRT', lat: 35.772, lng: 140.3929 },
  { iata: 'SYD', lat: -33.9399, lng: 151.1753 },
  { iata: 'DEL', lat: 28.5562, lng: 77.1 },
  { iata: 'DXB', lat: 25.2532, lng: 55.3657 },
  { iata: 'LHR', lat: 51.47, lng: -0.4543 },
  { iata: 'CDG', lat: 49.0097, lng: 2.5479 },
  { iata: 'FRA', lat: 50.0379, lng: 8.5622 },
  { iata: 'JFK', lat: 40.6413, lng: -73.7781 },
  { iata: 'LAX', lat: 33.9416, lng: -118.4085 },
  { iata: 'GRU', lat: -23.4356, lng: -46.4731 },
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The nearest hub to a point, excluding `exclude` (the origin itself when it is a hub). */
export function nearestFareHub(lat: number, lng: number, exclude?: string): FareHub | undefined {
  let best: { hub: FareHub; km: number } | undefined;
  for (const hub of FARE_HUBS) {
    if (hub.iata === exclude) continue;
    const km = haversineKm(lat, lng, hub.lat, hub.lng);
    if (best === undefined || km < best.km) best = { hub, km };
  }
  return best?.hub;
}

/** When a fare was seen: the day users found it when known, else when we fetched it. */
export function fareSeenAt(foundAt: Date | null, fetchedAt: Date | null): Date | null {
  return foundAt ?? fetchedAt;
}

/** Stale = the price was last confirmed more than 72 h ago (or never). */
export function isFareStale(fetchedAt: Date | null, now: Date): boolean {
  return fetchedAt === null || now.getTime() - fetchedAt.getTime() > FARE_STALE_HOURS * 3_600_000;
}

/** `YYYY-MM` for `date` in `tz`. */
export function monthKeyIn(date: Date, tz: string): string {
  return toLocalWallTime(date, tz).date.slice(0, 7);
}

/** `count` consecutive `YYYY-MM` keys starting at `first`. */
export function nextMonthKeys(first: string, count: number): string[] {
  const [year, month] = first.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const total = year * 12 + (month - 1) + index;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}
