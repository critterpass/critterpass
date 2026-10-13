const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * "30 Sep 2026" for a check date. A date-only value (`2026-09-30`) is a calendar day, so it is
 * formatted as that day in any zone; a full timestamp is shown in the reader's zone.
 */
export function formatCheckedDate(value: string, locale: string, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const day = DATE_ONLY.exec(value);
  if (day) {
    const at = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(at);
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { ...options, ...(timeZone ? { timeZone } : {}) }).format(
    at,
  );
}
