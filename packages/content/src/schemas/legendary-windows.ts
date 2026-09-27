/**
 * `windows` release items: when a legendary form can be found. Every legendary gets a dated
 * window (a festival or season, with the source it came from) or a challenge: the hardest thing
 * its place has, available any day. The designed six (3l-9) are fixtures in releases/windows.
 */
import { z } from 'zod';

import { formKeySchema, httpsUrlSchema, slugSchema } from './common';

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u;
export const monthDaySchema = z.string().regex(MONTH_DAY, 'must be MM-DD');

export const SOLAR_CONDITIONS = ['after_dark', 'by_sunrise'] as const;
export const solarConditionSchema = z.enum(SOLAR_CONDITIONS);
export type SolarCondition = z.infer<typeof solarConditionSchema>;

export const windowRuleSchema = z.discriminatedUnion('type', [
  /** The same calendar days every year (`11-01`…`11-02`); may wrap the new year. */
  z
    .object({ type: z.literal('annual_range'), start: monthDaySchema, end: monthDaySchema })
    .strict(),
  /** A part of a month that moves year to year (blossom peak, puffling nights). */
  z
    .object({
      type: z.literal('month_part'),
      month: z.number().int().min(1).max(12),
      part: z.enum(['early', 'mid', 'late']),
    })
    .strict(),
  /** Any day of the year: the window is the challenge itself. */
  z.object({ type: z.literal('any_day') }).strict(),
]);
export type WindowRule = z.infer<typeof windowRuleSchema>;

export const legendaryWindowItemSchema = z
  .object({
    id: slugSchema,
    form_id: formKeySchema,
    /** "Mexico City · Día de Muertos". */
    place_line: z.string().min(1).max(60),
    rule: windowRuleSchema,
    solar: solarConditionSchema.nullable(),
    /** The hardest thing the place has; required for any-day windows. */
    challenge: z.string().min(1).max(80).nullable(),
    /** Where the dates come from; required for dated windows. */
    source_url: httpsUrlSchema.nullable(),
    /** Part of the design (3l-9): the dates are fixed by the product, not researched. */
    designed: z.boolean(),
  })
  .strict()
  .superRefine((window, ctx) => {
    if (!window.form_id.endsWith(':legendary')) {
      ctx.addIssue({ code: 'custom', message: 'windows belong to legendary forms' });
    }
    if (window.rule.type === 'any_day' && window.challenge === null) {
      ctx.addIssue({ code: 'custom', message: 'an any-day window needs its challenge' });
    }
    if (window.rule.type !== 'any_day' && window.source_url === null) {
      ctx.addIssue({ code: 'custom', message: 'a dated window needs its source link' });
    }
  });
export type LegendaryWindowItem = z.infer<typeof legendaryWindowItemSchema>;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function monthLabel(month: number): string {
  return MONTHS[month - 1] ?? '';
}

/** The calendar strip's two-line label (3l-9): `NOV` / `1–2`, `APR` / `EARLY`, `ANY` / `DAY`. */
export function windowCalendarLabel(rule: WindowRule): { top: string; bottom: string } {
  switch (rule.type) {
    case 'annual_range': {
      const [startMonth, startDay] = rule.start.split('-').map(Number);
      const [endMonth, endDay] = rule.end.split('-').map(Number);
      const top = monthLabel(startMonth ?? 0);
      if (startMonth === endMonth) {
        return { top, bottom: startDay === endDay ? `${startDay}` : `${startDay}–${endDay}` };
      }
      return { top, bottom: `${startDay}–${monthLabel(endMonth ?? 0)} ${endDay}` };
    }
    case 'month_part':
      return { top: monthLabel(rule.month), bottom: rule.part.toUpperCase() };
    case 'any_day':
      return { top: 'ANY', bottom: 'DAY' };
  }
}

/** Months (1–12) a window can fall in; any-day windows cover every month. */
export function windowMonths(rule: WindowRule): readonly number[] {
  switch (rule.type) {
    case 'annual_range': {
      const start = Number(rule.start.slice(0, 2));
      const end = Number(rule.end.slice(0, 2));
      const months: number[] = [];
      for (let m = start; ; m = (m % 12) + 1) {
        months.push(m);
        if (m === end) break;
      }
      return months;
    }
    case 'month_part':
      return [rule.month];
    case 'any_day':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
}
