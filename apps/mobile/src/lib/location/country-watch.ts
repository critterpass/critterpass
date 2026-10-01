/**
 * The country the engine believes the device is in: what tells "at home" from "away". A running
 * session refreshes it from its fixes. With the session off at home there are no fixes, so the
 * belief would never change again and a landing would go unnoticed until the app restarts. While
 * a trip is under way the engine therefore asks for one coarse position instead (under the
 * permission the app already has; only the country is kept), often enough to notice the landing
 * and seldom enough to cost nothing. It is never asked on a day with no trip.
 */
import type { EngineFix } from './ports';

/** How often a running session re-checks the country of its fixes. */
export const COUNTRY_RECHECK_MS = 30 * 60_000;
/** Off at home with a trip under way: the position is re-read at most this often. */
export const AT_HOME_RECHECK_MS = 10 * 60_000;
/** The same, right after the trip started or the app came to the front. */
export const AT_HOME_RECHECK_FLOOR_MS = 60_000;

export interface CountryWatchOptions {
  readonly now: () => number;
  /** Country (ISO alpha-2) of a point, from the on-device geocoder. */
  readonly countryOf?: ((lat: number, lng: number) => Promise<string | null>) | undefined;
  /** One coarse position without a session; null when there is none or no permission. */
  readonly locate?:
    (() => Promise<{ readonly lat: number; readonly lng: number } | null>) | undefined;
  /** The believed country changed. */
  readonly onChange: () => void;
}

export function createCountryWatch(options: CountryWatchOptions) {
  const { now, countryOf, locate } = options;
  let current: string | null = null;
  let checkedAt = 0;
  let locatedAt = Number.NEGATIVE_INFINITY;

  function learn(country: string | null): void {
    if (country === null || country === current) return;
    current = country;
    options.onChange();
  }

  return {
    current: (): string | null => current,
    /** A session fix: geocoded at most every `COUNTRY_RECHECK_MS`. */
    onFix(fix: EngineFix): void {
      if (countryOf === undefined || now() - checkedAt < COUNTRY_RECHECK_MS) return;
      checkedAt = now();
      void countryOf(fix.lat, fix.lng).then(learn);
    },
    /** The engine is off as "at home" on a trip day: look again, sooner when `soon`. */
    recheckAtHome(soon: boolean): void {
      if (countryOf === undefined || locate === undefined) return;
      if (now() - locatedAt < (soon ? AT_HOME_RECHECK_FLOOR_MS : AT_HOME_RECHECK_MS)) return;
      locatedAt = now();
      void locate()
        .then((point) => (point === null ? null : countryOf(point.lat, point.lng)))
        .then(learn, () => undefined);
    },
  };
}
