/**
 * Our editors' rank among the essentials: the planner places the better-ranked first, and one
 * left out because every day it could go on went to a better-ranked essential says so.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { CREWS, planInput } from '../evals/draft/cases';
import { essentialsLeftOut, essentialsOf } from '../src/prompts/draft/essentials';

const crew = CREWS.find((c) => c.id === 'danang-v6-5');
if (crew === undefined) throw new Error('no danang-v6-5 crew');
const input = planInput(crew);
const named = (start: string) => {
  const poi = [...input.pois.values()].find((p) => p.name.startsWith(start));
  if (poi === undefined) throw new Error(`no place ${start}`);
  return poi;
};

describe('the essential rank', () => {
  it('puts the ranked essentials first, the better rank before the worse', () => {
    const ranks = essentialsOf(input).map((poi) => poi.essentialRank);
    const ranked = ranks.filter((rank): rank is number => rank !== undefined);
    expect(ranked).toEqual([...ranked].sort((a, b) => a - b));
    expect(ranks.indexOf(undefined)).toBe(-1);
    expect(essentialsOf(input)[0]?.name).toBe('Hội An Ancient Town');
  });

  it('reports an essential outranked when a better-ranked one holds each day it could go on', () => {
    const myson = named('Mỹ Sơn');
    const sontra = named('Sơn Trà Peninsula');
    const open = input.pools.openDays.get(myson.id) ?? [];
    expect(open.length).toBeGreaterThan(0);
    const item = (poiId: string, dayNo: number) => ({
      stable_id: `0199d000-0000-7000-8000-0000000${String(dayNo).padStart(5, '0')}`,
      kind: 'activity' as const,
      poi_id: poiId,
      starts_at: `${input.frame.dates[dayNo - 1]}T03:00:00.000Z`,
      ends_at: `${input.frame.dates[dayNo - 1]}T06:00:00.000Z`,
      tz: input.frame.tz,
      must_do_id: null,
      booking_id: null,
      locked_reason: null,
      cost_model: 'per_person' as const,
      amount_minor: 0,
      currency: 'VND',
      travel_min: 0,
      note: null,
    });
    const itinerary: Itinerary = {
      currency: 'VND',
      days: input.frame.dates.map((date, index) => ({
        day_no: index + 1,
        date,
        theme: '',
        items: open.includes(index + 1) ? [item(sontra.id, index + 1)] : [],
      })),
    };
    const gap = essentialsLeftOut(input, itinerary).find((g) => g.poiId === myson.id);
    expect(gap?.reason).toBe('outranked');
  });
});
