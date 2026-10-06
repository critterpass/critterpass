/**
 * What a redraft does with the pace she asked for, in a chip or in her note (its labels, read
 * once by a typed decision): a slower day never holds more stops (and its essentials stay), a late
 * start opens the day late, and a title promising a late morning is not kept on a day that starts
 * early. Each label drives exactly its own effect; the others are left to the guide.
 */
import type { Itinerary, RedraftReasonKey } from '@cp/domain';
import { dayWindow } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { withBaseDay } from '../evals/draft/base-day';
import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { keepEssentials, noNewClosures } from '../src/prompts/draft/redraft-essentials';
import type { RedraftNoteAsk } from '../src/decide/questions';
import { noteReasons, wantsLessWalking } from '../src/prompts/draft/redraft-asks';
import {
  plannedRedraft,
  redraftSkeletonDay,
  type RedraftPlanInput,
} from '../src/prompts/draft/redraft-input';
import { lateTitleEarlyDay, slowerDay, slowerLimits } from '../src/prompts/draft/redraft-pace';
import { wantsIndoors } from '../src/prompts/draft/redraft-rain';

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
const asked = (reasons: RedraftReasonKey[], asks: RedraftNoteAsk[] = []): RedraftPlanInput =>
  plannedRedraft({
    ...input,
    base,
    dayNo: 1,
    reasons,
    note: asks.length === 0 ? null : 'a note',
    asks,
    chat: [],
  });
const named = (name: string) => {
  const poi = [...input.pois.values()].find((p) => p.name === name);
  if (poi === undefined) throw new Error(`no place ${name}`);
  return poi;
};
const lake = named('Xuân Hương Lake');

describe('the pace of a redrafted day', { timeout: 60_000 }, () => {
  it('turns the slower and later-start labels into their chips, and no other label', () => {
    expect(noteReasons(['slower'])).toEqual(['slower']);
    expect(noteReasons(['later_start'])).toEqual(['later_start']);
    expect(noteReasons(['later_start', 'slower'])).toEqual(['slower', 'later_start']);
    expect(
      noteReasons(['faster', 'earlier_start', 'cheaper', 'swap_stop', 'indoor', 'less_walking']),
    ).toEqual([]);
    expect(noteReasons([])).toEqual([]);
    expect(noteReasons(undefined)).toEqual([]);
  });

  it('asks for a roof only on the indoor label and less walking only on its own', () => {
    expect(wantsIndoors({ asks: ['indoor'] })).toBe(true);
    expect(wantsIndoors({ asks: ['slower', 'less_walking'] })).toBe(false);
    expect(wantsLessWalking({ asks: ['less_walking'] })).toBe(true);
    expect(wantsLessWalking({ asks: ['slower', 'indoor'] })).toBe(false);
    expect(wantsLessWalking({})).toBe(false);
  });

  it('adds a chip the note asked for once, beside the same chip', () => {
    expect(asked(['slower'], ['slower']).reasons).toEqual(['slower']);
    expect(asked(['cheaper'], ['slower']).reasons).toEqual(['cheaper', 'slower']);
    expect(asked([], ['faster']).reasons).toEqual([]);
  });

  it('opens a day she asked to start late at half past ten or later', () => {
    const late = asked([], ['later_start']);
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
    const slower = asked([], ['slower']);
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
    const slower = asked(['slower']);
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
    const redraft = asked(['slower']);
    expect(noNewClosures(redraft, plan, plan, 2)).toBe(true);
    expect(noNewClosures(redraft, plan, late, 2)).toBe(false);
  });
});
