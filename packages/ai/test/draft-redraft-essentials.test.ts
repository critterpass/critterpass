/**
 * An essential a redraft takes off its day: back on the day when nothing she asked is against it
 * (a surprise keeps the lake), else on another day with room, else reported as taken out.
 */
import type { Itinerary, RedraftReasonKey } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { withBaseDay } from '../evals/draft/base-day';
import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { keepEssentials } from '../src/prompts/draft/redraft-essentials';
import { redraftSkeletonDay, type RedraftPlanInput } from '../src/prompts/draft/redraft-input';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
const input = planInput(crew);
const base = withBaseDay(input, baselineItinerary(input), 1, [
  'Crazy House',
  'Lâm Viên Square',
  'Xuân Hương Lake',
  'Lẩu Bò Ba Toa Quán Gỗ',
]);
const lake = [...input.pois.values()].find((p) => p.name === 'Xuân Hương Lake');
if (lake === undefined) throw new Error('no lake');
const day1 = base.days[0] as Itinerary['days'][number];
// The redrafted day as the guide left it: the lake taken out.
const withoutLake: Itinerary = {
  ...base,
  days: base.days.map((d) =>
    d.day_no === 1 ? { ...d, items: d.items.filter((i) => i.poi_id !== lake.id) } : d,
  ),
};
const asked = (reasons: RedraftReasonKey[], note: string | null): RedraftPlanInput => ({
  ...input,
  base,
  dayNo: 1,
  reasons,
  note,
  chat: [],
});
const dayOfLake = (plan: Itinerary) =>
  plan.days.find((d) => d.items.some((i) => i.poi_id === lake.id))?.day_no ?? null;

describe('the essentials of a redrafted day', { timeout: 60_000 }, () => {
  it('puts back an essential a surprise took out, keeping its id', () => {
    const redraft = asked(['surprise_me'], null);
    const kept = keepEssentials(redraft, redraftSkeletonDay(redraft), day1, withoutLake);
    expect(kept.leftOut).toEqual([]);
    expect(dayOfLake(kept.itinerary)).not.toBeNull();
    const was = day1.items.find((i) => i.poi_id === lake.id)?.stable_id;
    const now = kept.itinerary.days.flatMap((d) => d.items).find((i) => i.poi_id === lake.id);
    expect(now?.stable_id).toBe(was);
  });

  it('never puts an outdoor sight back on a day she asked to keep out of the rain', () => {
    const redraft = asked([], 'troi mua, cho minh cho trong nha');
    const kept = keepEssentials(redraft, redraftSkeletonDay(redraft), day1, withoutLake);
    expect(dayOfLake(kept.itinerary)).not.toBe(1);
    // Moved to a day with room, or said to be out.
    const moved = kept.moved.some((m) => m.poiId === lake.id);
    expect(moved || kept.leftOut.includes(lake.id)).toBe(true);
  });
});
