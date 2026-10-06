/**
 * What the planner reads in the guide's lines: the guide's chat hedge kept out of the plan, a
 * title held to what the day really has, and an evening for a crew that likes the night.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { resolvePersonaPack } from '../src/persona/resolve';
import { claimsTransport, titleFits } from '../src/prompts/draft/day-titles';
import { scheduleChoices } from '../src/prompts/draft/day';
import { isForEvening, wantsEvenings } from '../src/prompts/draft/evenings';
import { withoutHedge } from '../src/prompts/draft/hedge';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
const input = planInput(crew);
const base = baselineItinerary(input);
const named = (start: string) => {
  const poi = [...input.pois.values()].find((p) =>
    p.name.normalize('NFC').startsWith(start.normalize('NFC')),
  );
  if (poi === undefined) throw new Error(`no place ${start}`);
  return poi;
};
const dayWith = (dayNo: number, starts: readonly string[], theme: string) => {
  const day = base.days[dayNo - 1] as Itinerary['days'][number];
  const choices = starts.map((start) => ({
    poiId: named(start).id,
    kind: 'activity' as const,
    mustDoId: null,
    note: null,
  }));
  const outline = {
    dayNo,
    date: day.date,
    theme,
    area: 'the centre',
    mustDoIds: [],
    poiIds: choices.map((c) => c.poiId),
    mealIds: [],
    spareIds: [],
  };
  return { ...scheduleChoices(input, outline, choices, `words-${dayNo}`), theme };
};

describe("the guide's hedge", () => {
  it('stays in the chat: a plan line loses it and starts with a capital again', () => {
    // Đà Lạt's own guide, still learning its city.
    const hedge = resolvePersonaPack('ngua').learning?.hedge;
    expect(hedge).toBe('what Ngựa knows so far');
    expect(withoutHedge('From what Ngựa knows so far, món chè nhỏ xinh này đáng thử', 'ngua')).toBe(
      'Món chè nhỏ xinh này đáng thử',
    );
    expect(withoutHedge('Món chè nhỏ xinh này đáng thử', 'ngua')).toBe(
      'Món chè nhỏ xinh này đáng thử',
    );
  });
});

describe('a day title', () => {
  it('claims no flight, bus or train nobody entered', () => {
    const last = base.days[base.days.length - 1] as Itinerary['days'][number];
    expect(claimsTransport(input, { ...last, theme: 'Sáng thong thả trước giờ bay' })).toBe(true);
    expect(
      claimsTransport(input, { ...last, theme: 'A slow last morning before the flight' }),
    ).toBe(true);
    const flying = { ...input, frame: { ...input.frame, departureMin: 15 * 60 } };
    expect(claimsTransport(flying, { ...last, theme: 'Sáng thong thả trước giờ bay' })).toBe(false);
    expect(claimsTransport(input, { ...last, theme: 'Sáng thong thả cuối chuyến' })).toBe(false);
  });

  it('names a café only on a day with one, and waterfalls only on a day with two', () => {
    const one = dayWith(3, ['Datanla Falls', 'Trúc Lâm'], 'Thác và thiền viện');
    expect(titleFits(input, { ...one, theme: 'Thác và cà phê cuối ngày' })).toBe(false);
    expect(titleFits(input, { ...one, theme: 'Waterfalls and a quiet monastery' })).toBe(false);
    expect(titleFits(input, { ...one, theme: 'A waterfall and a quiet monastery' })).toBe(true);
    const two = dayWith(3, ['Datanla Falls', 'Khu du lịch Thác Prenn'], 'Hai thác');
    expect(titleFits(input, { ...two, theme: 'Waterfalls in the pines' })).toBe(true);
  });
});

describe('the evening', () => {
  it('is asked for by a night-owl crew, and the night market is a place for it', () => {
    expect(wantsEvenings(input)).toBe(true);
    expect(
      wantsEvenings({ ...input, tastes: {}, frame: { ...input.frame, chronotypes: {} } }),
    ).toBe(false);
    const evening = [...input.pois.values()].filter(isForEvening).map((poi) => poi.name);
    expect(evening.some((name) => /night market|chợ đêm/iu.test(name))).toBe(true);
  });
});
