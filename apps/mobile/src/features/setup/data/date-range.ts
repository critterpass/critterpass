/**
 * A local-date range as the setup screens show it ("Apr 2–9", "Apr 30 – May 3"), in UTC so a
 * calendar date never drifts across zones. Hermes has no `Intl.DateTimeFormat#formatRange`, so a
 * range inside one month puts both days into the start date's own locale pattern (via
 * `formatToParts`), and a range across months joins the two dates.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
const OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

function utcNoon(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

export function dayRange(locale: string, start: string, end: string): string {
  const format = new Intl.DateTimeFormat(locale, OPTIONS);
  const from = utcNoon(start);
  const to = utcNoon(end);
  const ranged = format as Intl.DateTimeFormat & {
    formatRange?: (a: Date, b: Date) => string;
  };
  if (typeof ranged.formatRange === 'function') return ranged.formatRange(from, to);
  if (start.slice(0, 10) === end.slice(0, 10)) return format.format(from);
  if (start.slice(0, 7) === end.slice(0, 7) && typeof format.formatToParts === 'function') {
    return format
      .formatToParts(from)
      .map((part) => (part.type === 'day' ? `${part.value}–${to.getUTCDate()}` : part.value))
      .join('');
  }
  return `${format.format(from)} – ${format.format(to)}`;
}
