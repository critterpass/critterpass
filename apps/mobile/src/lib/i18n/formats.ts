/**
 * How the person wants clock times and distances written (3n-8 FORMATS): 12- or 24-hour, km or
 * mi. Set from their synced settings by the data layer; every clock and distance in the app reads
 * it, and `useFormats()` redraws a screen when it changes. Unset, a clock follows the language's
 * own habit and distances read in kilometres.
 */
import { dateTimeFormat } from '@cp/i18n';
import { useSyncExternalStore } from 'react';

export type TimeFormat = '12h' | '24h';
export type DistanceUnit = 'km' | 'mi';

export interface Formats {
  /** Null: the language's own habit ("14:30" in Vietnamese, "2:30 PM" in US English). */
  readonly time: TimeFormat | null;
  readonly distance: DistanceUnit;
}

export const DEFAULT_FORMATS: Formats = { time: null, distance: 'km' };

let current: Formats = DEFAULT_FORMATS;
const listeners = new Set<() => void>();

export function setFormats(next: Formats): void {
  if (next.time === current.time && next.distance === current.distance) return;
  current = next;
  for (const listener of listeners) listener();
}

export function currentFormats(): Formats {
  return current;
}

/** Subscribes the calling component, so its clocks and distances redraw on a change. */
export function useFormats(): Formats {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/**
 * The `Intl.DateTimeFormat` option for the chosen clock, to spread into a time's options:
 * `{ hour: '2-digit', minute: '2-digit', ...clockOption() }`. Empty when the language decides.
 */
export function clockOption(formats: Formats = current): { hour12?: boolean } {
  return formats.time === null ? {} : { hour12: formats.time === '12h' };
}

/** A clock time in the chosen 12/24-hour style ("14:30", "2:30 PM"), in `timeZone` when given. */
export function clockText(locale: string, at: Date, timeZone?: string): string {
  return dateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...clockOption(),
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(at);
}

export const METERS_PER_MILE = 1609.344;

/**
 * A distance in metres as a number in the chosen unit, for copy that writes the unit itself
 * ("2.4 km", "1.5 mi"): Intl's unit style converts units on its own on some platforms.
 */
export function distanceIn(
  meters: number,
  formats: Formats = current,
): {
  readonly value: number;
  readonly unit: DistanceUnit;
} {
  return formats.distance === 'mi'
    ? { value: meters / METERS_PER_MILE, unit: 'mi' }
    : { value: meters / 1000, unit: 'km' };
}
