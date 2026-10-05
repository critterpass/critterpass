/**
 * What a redraft does with the pace she asked for, in a chip or in her own words: a slower day
 * never holds more stops (and its essentials stay), a late start opens the day late, and a title
 * promising a late morning is not kept on a day that starts early.
 */
import type { Itinerary, RedraftReasonKey } from '@cp/domain';
import { dayWindow } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { withBaseDay } from '../evals/draft/base-day';
import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { keepEssentials, noNewClosures } from '../src/prompts/draft/redraft-essentials';
import { noteReasons } from '../src/prompts/draft/redraft-asks';
import {
  plannedRedraft,
  redraftSkeletonDay,
  type RedraftPlanInput,
} from '../src/prompts/draft/redraft-input';
import { lateTitleEarlyDay, slowerDay, slowerLimits } from '../src/prompts/draft/redraft-pace';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
const input = planInput(crew);
const MEAL = 'Lẩu Bò Ba Toa Quán Gỗ';
const base = withBaseDay(input, baselineItinerary(input), 1, [
  'Xuân Hương Lake',
  'Lam Dong Museum',
  'Thiền viện Vạn Hạnh',
  MEAL,
]);
const day1 = base.days[0] as Itinerary['days'][number];
const asked = (reasons: RedraftReasonKey[], note: string | null): RedraftPlanInput =>
  plannedRedraft({ ...input, base, dayNo: 1, reasons, note, chat: [] });
const named = (name: string) => {
  const poi = [...input.pois.values()].find((p) => p.name === name);
  if (poi === undefined) throw new Error(`no place ${name}`);
  return poi;
};
const lake = named('Xuân Hương Lake');

describe('the pace of a redrafted day', { timeout: 60_000 }, () => {
  it('reads a slower day and a late start in her words, with or without marks', () => {
    expect(noteReasons('cham hon, it di bo')).toEqual(['slower']);
    expect(noteReasons('chậm hơn, ít đi bộ')).toEqual(['slower']);
    expect(noteReasons('a slow afternoon at the beach')).toEqual(['slower']);
    expect(noteReasons('ngay cuoi cho minh ngu nuong, di muon mot chut')).toEqual(['later_start']);
    expect(noteReasons('Let us sleep in, then something relaxed')).toEqual([
      'slower',
      'later_start',
    ]);
    expect(noteReasons('more temples please')).toEqual([]);
    expect(noteReasons(null)).toEqual([]);
  });

  it('opens a day she asked to start late at half past ten or later', () => {
    const late = asked([], 'ngu nuong, di muon mot chut');
    expect(late.reasons).toContain('later_start');
    expect(dayWindow(late.frame, 0).startMin).toBeGreaterThanOrEqual(10 * 60);
  });

  it('never leaves a slower day with more stops than it had, and keeps its essential', () => {
    const fuller = withBaseDay(input, base, 1, [
      'Xuân Hương Lake',
      'Lam Dong Museum',
      'Thiền viện Vạn Hạnh',
      'Đồi Cỏ Hồng',
      'Ga Trại Mát',
      MEAL,
    ]);
    const slower = asked([], 'cham hon, it di bo');
    const paced = slowerDay(slower, redraftSkeletonDay(slower), day1, fuller);
    const day = paced.days[0] as Itinerary['days'][number];
    const limits = slowerLimits(day1);
    expect(day.items.length).toBeLessThanOrEqual(limits.stops);
    expect(day.items.filter((i) => i.kind === 'activity').length).toBeLessThanOrEqual(
      limits.activities,
    );
    expect(day.items.some((i) => i.poi_id === lake.id)).toBe(true);
    expect(day.items.some((i) => i.poi_id === named(MEAL).id)).toBe(true);
  });

  it('puts back an essential a slower day dropped instead of taking it off the trip', () => {
    const slower = asked(['slower'], null);
    const withoutLake: Itinerary = {
      ...base,
      days: base.days.map((d) =>
        d.day_no === 1 ? { ...d, items: d.items.filter((i) => i.poi_id !== lake.id) } : d,
      ),
    };
    const kept = keepEssentials(slower, redraftSkeletonDay(slower), day1, withoutLake);
    expect(kept.leftOut).not.toContain(lake.id);
  });

  it('knows a late-morning title on a day that starts early', () => {
    const at = (clock: string) => `${day1.date}T${clock}:00+07:00`;
    const startingAt = (clock: string, theme: string) => ({
      ...day1,
      theme,
      items: day1.items.map((item, index) =>
        index === 0 ? { ...item, starts_at: at(clock) } : item,
      ),
    });
    expect(lateTitleEarlyDay(input, startingAt('08:30', 'Sáng muộn ở Đà Lạt'))).toBe(true);
    expect(lateTitleEarlyDay(input, startingAt('10:30', 'Sáng muộn ở Đà Lạt'))).toBe(false);
    expect(lateTitleEarlyDay(input, startingAt('08:30', 'Hồ và chùa'))).toBe(false);
  });

  it('takes no placement that leaves a stop of its day outside its hours', () => {
    const museum = named('Lam Dong Museum');
    const plan = withBaseDay(input, base, 2, [museum.name, MEAL]);
    const day2 = plan.days[1] as Itinerary['days'][number];
    const late: Itinerary = {
      ...plan,
      days: plan.days.map((d) =>
        d.day_no !== 2
          ? d
          : {
              ...d,
              items: d.items.map((i) =>
                i.poi_id === museum.id
                  ? {
                      ...i,
                      starts_at: `${day2.date}T18:30:00+07:00`,
                      ends_at: `${day2.date}T19:15:00+07:00`,
                    }
                  : i,
              ),
            },
      ),
    };
    const redraft = asked(['slower'], null);
    expect(noNewClosures(redraft, plan, plan, 2)).toBe(true);
    expect(noNewClosures(redraft, plan, late, 2)).toBe(false);
  });
});
