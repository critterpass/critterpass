/** Date/time `Intl` wrappers (design-system.md §6 "Dates & times"). */

export interface TimeFormatOptions {
  /** The user's `time_format` setting (data-model.md `user_settings`); `undefined` lets `Intl` pick the locale default. */
  readonly hour12?: boolean;
}

export function date(locale: string, value: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function time(locale: string, value: Date, options?: TimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: options?.hour12,
  }).format(value);
}

/** e.g. "Sep 27 – Oct 3" for a trip's date range, per design-system.md's "interval formatting for ranges". */
export function dateInterval(
  locale: string,
  start: Date,
  end: Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const formatter = new Intl.DateTimeFormat(locale, options);
  // Hermes has no `formatRange`: the same day once, days of one month as "Sep 27–30" (when the
  // parts can be read), anything else as the two dates around an en dash.
  const ranged = formatter as Intl.DateTimeFormat & {
    formatRange?: (a: Date, b: Date) => string;
  };
  if (typeof ranged.formatRange === 'function') return ranged.formatRange(start, end);
  const from = formatter.format(start);
  const to = formatter.format(end);
  if (from === to) return from;
  if (typeof formatter.formatToParts === 'function') {
    const first = formatter.formatToParts(start);
    const last = formatter.formatToParts(end);
    const day = last.find((part) => part.type === 'day')?.value;
    const sameButDay =
      first.length === last.length &&
      first.every((part, index) => part.type === 'day' || part.value === last[index]?.value);
    if (day !== undefined && sameButDay) {
      return first
        .map((part) => (part.type === 'day' ? `${part.value}–${day}` : part.value))
        .join('');
    }
  }
  return `${from} – ${to}`;
}

/** e.g. "in 3 days", "2 hours ago" — countdown/activity copy that is not a fixed calendar date. */
export function relativeTime(
  locale: string,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string {
  return new Intl.RelativeTimeFormat(locale, options).format(value, unit);
}
