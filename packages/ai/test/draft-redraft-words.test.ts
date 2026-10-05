/**
 * What the planner reads in the organiser's own words and the guide's lines: rain and less
 * walking in Vietnamese typed without its marks, the guide's chat hedge kept out of the plan, a
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
import { wantsLessWalking } from '../src/prompts/draft/redraft-asks';
import { wantsIndoors } from '../src/prompts/draft/redraft-rain';

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

describe('the organiser note', () => {
  it('asks for a roof in Vietnamese with or without its marks, and not when she means to buy', () => {
    expect(wantsIndoors({ note: 'Hom do troi hay mua, cho minh cho trong nha' })).toBe(true);
    expect(wantsIndoors({ note: 'trời hay mưa, cho mình chỗ trong nhà' })).toBe(true);
    expect(wantsIndoors({ note: 'neu mua to thi doi ke hoach' })).toBe(true);
    expect(wantsIndoors({ note: 'muon mua dac san o cho' })).toBe(false);
  });

  it('asks for less walking in Vietnamese with or without its marks, and in English', () => {
    expect(wantsLessWalking({ note: 'thêm một quán cà phê view đẹp, bớt đi bộ' })).toBe(true);
    expect(wantsLessWalking({ note: 'them quan ca phe, bot di bo' })).toBe(true);
    expect(wantsLessWalking({ note: 'Add a cafe with a view, less walking' })).toBe(true);
    expect(wantsLessWalking({ note: 'đi bộ quanh hồ thật lâu' })).toBe(false);
  });
});

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
