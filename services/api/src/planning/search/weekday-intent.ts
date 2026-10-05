/**
 * A weekday named in a plain-words question means "on that day": "a waterfall without the crowds,
 * Mon" looks at Monday's hours, and only "not Mon", "except Monday" or "trừ thứ hai" leaves the
 * day out. The filter has only days to leave out, so "on Monday" leaves out every other day of the
 * plan. Applied to the parse's answer: a day the model left out although the question asked for
 * it is put back, and a clearly named day the model ignored is honoured.
 */
import type { SearchParseDay } from '@cp/ai';
import type { SearchParseResult, Weekday } from '@cp/domain';

const fold = (text: string) =>
  text.replace(/[đĐ]/gu, 'd').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface WeekdayWords {
  readonly day: Weekday;
  /** Names nobody types for anything else. */
  readonly clear: RegExp;
  /** Short names that are also words ("sun", "sat"): only trusted when the model named the day. */
  readonly short?: RegExp;
}

const WEEKDAY_WORDS: readonly WeekdayWords[] = [
  { day: 'mo', clear: /\b(mondays?|mon|thu hai|thu 2|t2)\b/gu },
  { day: 'tu', clear: /\b(tuesdays?|tues?|thu ba|thu 3|t3)\b/gu },
  { day: 'we', clear: /\b(wednesdays?|wed|thu tu|thu 4|t4)\b/gu },
  {
    day: 'th',
    clear: /\b(thursdays?|thurs?|thu nam|thu 5|t5)\b/gu,
    // "thu" alone is Thursday in English and "thứ" (the start of every weekday) in Vietnamese.
    short: /\bthu(?! (hai|ba|tu|nam|sau|bay|[2-7])\b)\b/gu,
  },
  { day: 'fr', clear: /\b(fridays?|fri|thu sau|thu 6|t6)\b/gu },
  { day: 'sa', clear: /\b(saturdays?|thu bay|thu 7|t7)\b/gu, short: /\bsat\b/gu },
  { day: 'su', clear: /\b(sundays?|chu nhat)\b/gu, short: /\b(sun|cn)\b/gu },
];

const NEGATION =
  /\b(not|except|but|never|skip|avoid|other than|khong|tru|ngoai tru|ngoai)\s+(on\s+|for\s+|vao\s+)?$/u;

export interface NamedWeekdays {
  /** Asked for by a name that is only ever a weekday. */
  readonly clear: ReadonlySet<Weekday>;
  /** Asked for by any name, short ones included. */
  readonly any: ReadonlySet<Weekday>;
}

/** The weekdays a question asks for; a negated one ("not Wed") is not asked for. */
export function namedWeekdays(question: string): NamedWeekdays {
  const text = fold(question);
  const clear = new Set<Weekday>();
  const any = new Set<Weekday>();
  const asked = (pattern: RegExp) =>
    [...text.matchAll(pattern)].some((match) => !NEGATION.test(text.slice(0, match.index)));
  for (const words of WEEKDAY_WORDS) {
    if (asked(words.clear)) {
      clear.add(words.day);
      any.add(words.day);
    } else if (words.short !== undefined && asked(words.short)) {
      any.add(words.day);
    }
  }
  return { clear, any };
}

/**
 * The parse's answer with a named weekday read as "on that day". Left as it is when the question
 * names no weekday, or the model left out days the question did not name.
 */
export function withWeekdayIntent(
  question: string,
  result: SearchParseResult,
  days: readonly Pick<SearchParseDay, 'id' | 'weekday'>[],
): SearchParseResult {
  const named = namedWeekdays(question);
  if (named.any.size === 0) return result;
  const weekdayOf = new Map(days.map((day) => [day.id, day.weekday]));
  const excluded = result.filters.exclude_day_ids ?? [];
  const modelNamedThem =
    excluded.length > 0 &&
    excluded.every((id) => {
      const weekday = weekdayOf.get(id);
      return weekday !== undefined && named.any.has(weekday);
    });
  const wanted = modelNamedThem ? named.any : excluded.length === 0 ? named.clear : null;
  if (wanted === null || wanted.size === 0) return result;
  const kept = days.filter((day) => wanted.has(day.weekday));
  // The plan has no such day: nothing to leave out.
  const others = kept.length === 0 ? [] : days.filter((day) => !wanted.has(day.weekday));
  const { exclude_day_ids: _dropped, ...filters } = result.filters;
  const chips = result.chips.filter((chip) => chip.code !== 'exclude_days');
  if (others.length === 0) return { filters, chips };
  const ids = others.map((day) => day.id);
  return {
    filters: { ...filters, exclude_day_ids: ids },
    chips: [...chips, { code: 'exclude_days', params: { day_ids: ids } }],
  };
}
