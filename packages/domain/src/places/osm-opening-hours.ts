/**
 * Lenient OSM `opening_hours` reader for open-data ingest: turns the strings mappers actually write
 * into the stored `Hours` shape, or null when the value cannot be represented as a plain weekly
 * schedule. Unlike `parseOpeningHours` (the strict subset editorial overlays use), this never
 * throws: a wrong schedule is worse than an unknown one, so anything ambiguous reads as unknown.
 *
 * Understood: `24/7`; day lists and ranges (`Mo-Fr`, `Mo,We`, `Sa-Mo`); rules without days (every
 * day); `;` rules where a later rule replaces the days it names; `,` and `||` additional rules that
 * add to their days; `off`/`closed`; `open` modifiers; single-digit hours (`9:00`); en dashes; times
 * past midnight (`18:00-02:00`, `18:00-26:00`); public holiday tokens (`PH`, `SH`), which are
 * dropped because a weekly schedule has no holidays.
 *
 * Unknown (null): month or date ranges (seasonal hours), week numbers, nth weekdays (`Mo[1]`),
 * sunrise/sunset times, open ends (`18:00+`), `unknown`, comments, and anything else unrecognised.
 */
import { WEEKDAYS, hoursSchema, type Hours, type TimeSpan, type Weekday } from './hours';

const DAY_TOKENS: Readonly<Record<string, number>> = Object.fromEntries(
  WEEKDAYS.map((day, index) => [day, index]),
);
const HOLIDAY_TOKENS = new Set(['ph', 'sh']);
const DAY_SELECTOR =
  /^(?:(?:mo|tu|we|th|fr|sa|su)(?:-(?:mo|tu|we|th|fr|sa|su))?|ph|sh)(?:,(?:(?:mo|tu|we|th|fr|sa|su)(?:-(?:mo|tu|we|th|fr|sa|su))?|ph|sh))*$/;
const TIME_SPAN = /^(\d{1,2}):([0-5]\d)-(\d{1,2}):([0-5]\d)$/;
/** A comma after a time or `off` that starts a new day selector begins an additional rule. */
const ADDITIONAL_RULE_SPLIT = /(?<=\d|off|closed),(?=(?:mo|tu|we|th|fr|sa|su|ph|sh)\b)/u;

class Unreadable extends Error {}

function pad(hour: number, minute: string): string {
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function readSpan(token: string): TimeSpan {
  const match = TIME_SPAN.exec(token);
  if (match === null) throw new Unreadable(token);
  const [, startHour, startMinute, endHour, endMinute] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  const fromHour = Number(startHour);
  let toHour = Number(endHour);
  if (fromHour > 23 || toHour > 48) throw new Unreadable(token);
  // 24:00 closes at midnight; later hours (26:00) run into the next day.
  if (toHour > 24 || (toHour === 24 && endMinute !== '00')) toHour -= 24;
  const start = pad(fromHour, startMinute);
  // A close at 00:00 is midnight at the end of the day.
  const end =
    toHour === 24 || (toHour === 0 && endMinute === '00') ? '24:00' : pad(toHour, endMinute);
  if (start === end) throw new Unreadable(token);
  return { start, end };
}

function readDays(selector: string): Weekday[] {
  const days: Weekday[] = [];
  for (const token of selector.split(',')) {
    if (HOLIDAY_TOKENS.has(token)) continue;
    const [from, to] = token.split('-') as [string, string | undefined];
    const fromIndex = DAY_TOKENS[from] as number;
    const toIndex = to === undefined ? fromIndex : (DAY_TOKENS[to] as number);
    for (let index = fromIndex; ; index = (index + 1) % 7) {
      days.push(WEEKDAYS[index] as Weekday);
      if (index === toIndex) break;
    }
  }
  return [...new Set(days)];
}

interface Rule {
  /** Null = the rule names only holidays, so it changes nothing in a weekly schedule. */
  readonly days: readonly Weekday[] | null;
  readonly spans: readonly TimeSpan[];
}

function readRule(text: string): Rule {
  const words = text.split(' ').filter((word) => word.length > 0 && word !== 'open');
  let days: readonly Weekday[] | null = WEEKDAYS;
  if (words[0] !== undefined && DAY_SELECTOR.test(words[0])) {
    const named = readDays(words.shift() as string);
    days = named.length === 0 ? null : named;
  }
  if (words.length === 1 && (words[0] === 'off' || words[0] === 'closed')) {
    return { days, spans: [] };
  }
  if (words.length === 0) throw new Unreadable(text);
  // `08:00-12:00 13:00-17:00` (a space instead of a comma) is a common slip for a span list.
  const spans = words
    .join(',')
    .split(',')
    .filter((token) => token.length > 0)
    .map(readSpan);
  if (spans.length === 0) throw new Unreadable(text);
  return { days, spans };
}

function normalise(source: string): string {
  return (
    source
      .toLowerCase()
      .replaceAll(/[–—−]/gu, '-')
      .replaceAll(/\s*-\s*/gu, '-')
      .replaceAll(/\s*,\s*/gu, ',')
      // `Mon-Sat`, `Thu`: three-letter day names are a frequent slip for the two-letter ones.
      .replaceAll(/\b(mo|tu|we|th|fr|sa|su)[nesduitr]\b/gu, '$1')
      // `Mo-Su12:00-23:00`: a missing space between the days and the times.
      .replaceAll(/(mo|tu|we|th|fr|sa|su|ph|sh)(\d)/gu, '$1 $2')
      .replaceAll(/\s+/gu, ' ')
      .trim()
  );
}

function sortedSpans(spans: readonly TimeSpan[]): TimeSpan[] {
  return [...spans].sort((a, b) => a.start.localeCompare(b.start));
}

/** Reads an OSM `opening_hours` value; null when unknown or not a plain weekly schedule. */
export function parseOsmOpeningHours(source: string | null | undefined): Hours | null {
  if (source === null || source === undefined) return null;
  const text = normalise(source);
  if (text.length === 0 || text.includes('"')) return null;
  const weekly: Partial<Record<Weekday, TimeSpan[]>> = {};
  try {
    for (const group of text.split(/;|\|\|/u)) {
      const trimmed = group.trim();
      if (trimmed.length === 0) continue;
      if (trimmed === '24/7' || trimmed === '24/7 open') {
        for (const day of WEEKDAYS) weekly[day] = [{ start: '00:00', end: '24:00' }];
        continue;
      }
      // Within one `;` rule, `, Sa 10:00-12:00` adds another day selector to the same rule.
      const touched = new Set<Weekday>();
      for (const part of trimmed.split(ADDITIONAL_RULE_SPLIT)) {
        const rule = readRule(part.trim());
        if (rule.days === null) continue;
        for (const day of rule.days) {
          const previous = touched.has(day) ? (weekly[day] ?? []) : [];
          weekly[day] = [...previous, ...rule.spans];
          touched.add(day);
        }
      }
    }
  } catch (error) {
    if (error instanceof Unreadable) return null;
    throw error;
  }
  for (const day of WEEKDAYS) {
    const spans = weekly[day];
    if (spans !== undefined) weekly[day] = sortedSpans(spans);
  }
  const hasOpenDay = Object.values(weekly).some((spans) => (spans?.length ?? 0) > 0);
  if (!hasOpenDay) return null;
  const parsed = hoursSchema.safeParse({ weekly });
  return parsed.success ? parsed.data : null;
}
