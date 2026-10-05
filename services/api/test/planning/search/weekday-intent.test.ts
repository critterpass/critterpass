import type { SearchParseResult } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { namedWeekdays, withWeekdayIntent } from '../../../src/planning/search/weekday-intent';

const DAYS = [
  { id: '00000000-0000-4000-8000-000000000001', weekday: 'mo' },
  { id: '00000000-0000-4000-8000-000000000002', weekday: 'tu' },
  { id: '00000000-0000-4000-8000-000000000003', weekday: 'we' },
] as const;
const [MON, TUE, WED] = DAYS.map((day) => day.id) as [string, string, string];

const parsed = (exclude?: string[]): SearchParseResult => ({
  filters: {
    categories: ['nature'],
    ...(exclude === undefined ? {} : { exclude_day_ids: exclude }),
  },
  chips: [
    { code: 'category', params: { category: 'nature' } },
    ...(exclude === undefined
      ? []
      : [{ code: 'exclude_days' as const, params: { day_ids: exclude } }]),
  ],
  ...(exclude === undefined
    ? {}
    : { exclude_reason: { code: 'day_full' as const, params: { day_ids: exclude } } }),
});

describe('a weekday named in a question', () => {
  it('means on that day: a day the model left out is put back and the others go', () => {
    const result = withWeekdayIntent('a waterfall without the crowds, Mon', parsed([MON]), DAYS);
    expect(result.filters.exclude_day_ids).toEqual([TUE, WED]);
    expect(result.chips.at(-1)).toEqual({ code: 'exclude_days', params: { day_ids: [TUE, WED] } });
    expect(result.exclude_reason).toBeUndefined();
  });

  it('is honoured when the model ignored it', () => {
    const result = withWeekdayIntent('thác vắng người, thứ ba', parsed(), DAYS);
    expect(result.filters.exclude_day_ids).toEqual([MON, WED]);
  });

  it('stays left out when she says not, except or trừ', () => {
    for (const question of ['dinner, not Wed', 'dinner except on Wednesday', 'ăn tối trừ thứ tư']) {
      expect(withWeekdayIntent(question, parsed([WED]), DAYS)).toEqual(parsed([WED]));
    }
  });

  it('leaves the model’s own reason alone when it left out another day', () => {
    expect(withWeekdayIntent('dinner on Mon', parsed([WED]), DAYS)).toEqual(parsed([WED]));
  });

  it('leaves nothing out when the plan has no such day', () => {
    const result = withWeekdayIntent('a waterfall on Saturday', parsed(), DAYS);
    expect(result.filters.exclude_day_ids).toBeUndefined();
    expect(result.chips).toHaveLength(1);
  });

  it('does not take "in the sun" or "thứ hai" for Sunday or Thursday', () => {
    expect(namedWeekdays('lunch in the sun').clear.size).toBe(0);
    expect(withWeekdayIntent('lunch in the sun', parsed(), DAYS)).toEqual(parsed());
    expect([...namedWeekdays('ăn sáng thứ hai').any]).toEqual(['mo']);
  });
});
