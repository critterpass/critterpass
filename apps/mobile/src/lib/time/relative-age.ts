const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 hours ago" in the UI locale; "now" under a minute. */
export function relativeAge(updatedAt: Date, now: Date, locale: string): string {
  const elapsed = updatedAt.getTime() - now.getTime();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return format.format(Math.round(elapsed / ms), unit);
  }
  return format.format(0, 'minute');
}
