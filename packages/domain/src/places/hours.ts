/**
 * Opening-hours storage shape and the OSM `opening_hours` subset parser that fills it
 * (docs/data-model.md §3.13 `pois.hours jsonb`: "OSM-style weekly spans + exceptions"). What is
 * stored is always this structured shape, never the raw OSM string: ingest parses once at write time
 * via `parseOpeningHours`, and `open-at.ts` only ever evaluates spans, never text.
 *
 * The parser covers the subset real POI data actually uses: `Mo-Fr 09:00-18:00`, comma day/time
 * lists (`Mo,We,Fr 09:00-12:00,13:00-18:00`), `off`/`closed`, overnight spans (`Fr-Sa 20:00-02:00`)
 * and `24/7` — not the full OSM grammar (comments, holidays-by-name, `PH`, week numbers), which no
 * FSQ OS Places or Overture record in this project's sources ever emits.
 */
import { z } from 'zod';

import { DomainError } from '../errors';

export const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DAY_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  WEEKDAYS.map((day, index) => [day, index]),
);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const END_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const timeSpanSchema = z
  .object({
    start: z.string().regex(TIME_PATTERN, 'must be HH:MM'),
    end: z.string().regex(END_TIME_PATTERN, 'must be HH:MM or 24:00'),
  })
  .strict();
export type TimeSpan = z.infer<typeof timeSpanSchema>;

const weeklySpansSchema = z
  .object({
    mo: z.array(timeSpanSchema).optional(),
    tu: z.array(timeSpanSchema).optional(),
    we: z.array(timeSpanSchema).optional(),
    th: z.array(timeSpanSchema).optional(),
    fr: z.array(timeSpanSchema).optional(),
    sa: z.array(timeSpanSchema).optional(),
    su: z.array(timeSpanSchema).optional(),
  })
  .strict();
export type WeeklySpans = z.infer<typeof weeklySpansSchema>;

export const hoursExceptionSchema = z
  .object({
    /** Local calendar date in the destination (or POI override) tz, `YYYY-MM-DD`. */
    date: z.string().regex(DATE_PATTERN, 'must be YYYY-MM-DD'),
    /** Empty = closed all day (e.g. a public holiday). */
    spans: z.array(timeSpanSchema),
    note: z.string().min(1).optional(),
  })
  .strict();
export type HoursException = z.infer<typeof hoursExceptionSchema>;

export const hoursSchema = z
  .object({
    weekly: weeklySpansSchema,
    exceptions: z.array(hoursExceptionSchema).optional(),
  })
  .strict();
export type Hours = z.infer<typeof hoursSchema>;

export const EMPTY_HOURS: Hours = { weekly: {} };

function expandDayToken(token: string): readonly Weekday[] {
  const rangeMatch = /^([a-z]{2})-([a-z]{2})$/i.exec(token);
  if (rangeMatch) {
    const [, fromToken, toToken] = rangeMatch as unknown as [string, string, string];
    const from = DAY_INDEX[fromToken.toLowerCase()];
    const to = DAY_INDEX[toToken.toLowerCase()];
    if (from === undefined || to === undefined) {
      throw new DomainError('VALIDATION', { reason: 'unrecognised day range', token });
    }
    const days: Weekday[] = [];
    for (let index = from; ; index = (index + 1) % 7) {
      days.push(WEEKDAYS[index] as Weekday);
      if (index === to) break;
    }
    return days;
  }
  const index = DAY_INDEX[token.toLowerCase()];
  if (index === undefined)
    throw new DomainError('VALIDATION', { reason: 'unrecognised day', token });
  return [WEEKDAYS[index] as Weekday];
}

function expandDaySelector(selector: string): readonly Weekday[] {
  const days = selector.split(',').flatMap((token) => expandDayToken(token.trim()));
  return [...new Set(days)];
}

function parseTimeSpanToken(token: string): TimeSpan {
  const match = /^([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/.exec(token);
  if (!match) throw new DomainError('VALIDATION', { reason: 'unrecognised time span', token });
  const [, start, end] = match as unknown as [string, string, string];
  return { start, end };
}

const ALWAYS_OPEN_SPAN: TimeSpan = { start: '00:00', end: '24:00' };

/**
 * Parses an OSM `opening_hours` string (the subset this file's header documents) into weekly spans.
 * Later rules override earlier ones for the same day (this project's subset of `;`-separated rules,
 * not full OSM comma-additive semantics); a day never mentioned by any rule has no spans (closed).
 */
export function parseOpeningHours(source: string): WeeklySpans {
  const trimmed = source.trim();
  if (trimmed.length === 0) return {};

  const weekly: Record<string, TimeSpan[]> = {};
  for (const rawRule of trimmed.split(';')) {
    const rule = rawRule.trim();
    if (rule.length === 0) continue;

    if (rule === '24/7') {
      for (const day of WEEKDAYS) weekly[day] = [ALWAYS_OPEN_SPAN];
      continue;
    }

    const spaceIndex = rule.indexOf(' ');
    if (spaceIndex === -1) {
      throw new DomainError('VALIDATION', { reason: 'unrecognised opening_hours rule', rule });
    }
    const days = expandDaySelector(rule.slice(0, spaceIndex));
    const rest = rule.slice(spaceIndex + 1).trim();

    if (rest === 'off' || rest === 'closed') {
      for (const day of days) weekly[day] = [];
      continue;
    }

    const spans = rest.split(',').map((token) => parseTimeSpanToken(token.trim()));
    for (const day of days) weekly[day] = spans;
  }
  return weekly;
}
