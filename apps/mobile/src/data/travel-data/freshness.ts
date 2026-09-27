/**
 * Freshness for every travel-data read (fares, destination insights, crowds, weather, hazards):
 * each hook answers a `ReadState` that is `ok`, `stale` (still shown, with why and when it was
 * seen) or `missing` (never a made-up value), and `formatSeen` renders "3h ago" in the reader's
 * locale for the UI's own localized "seen {ago}" / "CHECKED {ago}" copy.
 */

export type ReadSource = 'network' | 'cache' | 'synced';

/** Why data is shown stale: no connection (last good copy), the source itself is old, or the
 *  server's last refresh failed and it kept the previous forecast. */
export type StaleReason = 'offline' | 'old' | 'refresh_failed';

export type MissingReason = 'offline' | 'no_data' | 'not_found' | 'error';

export type ReadState<T> =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ok';
      readonly data: T;
      readonly seenAt: string | null;
      readonly source: ReadSource;
    }
  | {
      readonly status: 'stale';
      readonly data: T;
      readonly seenAt: string | null;
      readonly source: ReadSource;
      readonly reason: StaleReason;
    }
  | { readonly status: 'missing'; readonly reason: MissingReason };

export type SeenUnit = 'now' | 'minute' | 'hour' | 'day';

export interface SeenAgo {
  readonly unit: SeenUnit;
  readonly count: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Whole units since `at`: under a minute is `now`, then minutes, hours, days. */
export function seenAgo(at: string | Date, now: Date): SeenAgo {
  const elapsed = Math.max(0, now.getTime() - new Date(at).getTime());
  if (elapsed < MINUTE) return { unit: 'now', count: 0 };
  if (elapsed < HOUR) return { unit: 'minute', count: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { unit: 'hour', count: Math.floor(elapsed / HOUR) };
  return { unit: 'day', count: Math.floor(elapsed / DAY) };
}

/** "3h ago" / "just now" in `locale` (narrow relative time), for "seen {ago}" copy. */
export function formatSeen(at: string | Date, now: Date, locale = 'en'): string {
  const ago = seenAgo(at, now);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  return ago.unit === 'now' ? format.format(0, 'second') : format.format(-ago.count, ago.unit);
}

/** The data a state carries, when it carries any. */
export function dataOf<T>(state: ReadState<T>): T | undefined {
  return state.status === 'ok' || state.status === 'stale' ? state.data : undefined;
}
