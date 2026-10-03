import { gapIdeasResultSchema, gapSchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { dayGaps, findGaps, gapIdeas, type GapCandidate } from '../../src/fit/index';
import {
  ALEX,
  BALI,
  COFFEE,
  COOKING,
  DAY,
  DINNER,
  FOUR,
  MARKET,
  MAYA,
  POINTS,
  RIN,
  SPA,
  daily,
} from './bali-fixture';

const wednesday = BALI.days[1]!;

describe('free windows', () => {
  it('Wednesday 16:00-19:00: four free, Maya and Rin at the spa till 18:00, dinner next', () => {
    const gaps = findGaps(BALI).filter((gap) => gap.day_id === DAY(2));
    const four = gaps.find((gap) => gap.who_free.length === 4);
    expect(four).toEqual({
      day_id: DAY(2),
      day_no: 2,
      from: '16:00',
      to: '19:00',
      minutes: 180,
      who_free: [...FOUR].sort(),
      busy: [{ user_ids: [MAYA, RIN], stable_id: SPA, until: '18:00' }],
      after_item: COOKING,
      next_item: DINNER,
    });
    for (const gap of gaps) expect(gapSchema.parse(gap)).toEqual(gap);
  });

  it('never repeats a window that a longer one for more people already covers', () => {
    const gaps = findGaps(BALI).filter((gap) => gap.day_id === DAY(2));
    expect(gaps.every((gap) => gap.minutes >= 60 && gap.who_free.length >= 2)).toBe(true);
    expect(gaps.filter((gap) => gap.who_free.length === 4)).toHaveLength(1);
  });

  it('a free day is one window for everyone', () => {
    const saturday = findGaps(BALI).filter((gap) => gap.day_no === 5);
    expect(saturday).toHaveLength(1);
    expect(saturday[0]).toMatchObject({
      from: '07:00',
      to: '22:00',
      who_free: [...BALI.participants].sort(),
    });
  });
});

const place = (
  poiId: string,
  point: { lat: number; lng: number },
  hours: [string, string],
  minutes: number,
) => ({
  poiId,
  point,
  category: 'food',
  hours: daily(...hours),
  timeNeededMin: minutes,
  outdoor: false,
});

describe('gap ideas', () => {
  const entry = dayGaps(BALI, wednesday).find((gap) => gap.gap.who_free.length === 4)!;

  it('crew ideas first, then curated places, then a pair back to back', () => {
    const pool: GapCandidate[] = [
      {
        place: place(MARKET, POINTS.market, ['09:00', '18:00'], 30),
        source: 'curated',
        costEachMinor: null,
        currency: null,
        saverId: null,
        votedBy: [],
      },
      {
        place: place(COFFEE, POINTS.coffee, ['08:00', '18:00'], 45),
        source: 'idea',
        costEachMinor: 50_000,
        currency: 'IDR',
        saverId: ALEX,
        votedBy: [ALEX],
      },
    ];
    const ideas = gapIdeas(BALI, entry, pool);
    expect(ideas.map((idea) => idea.kind)).toEqual(['single', 'single', 'pair']);
    expect(ideas[0]).toMatchObject({
      poi_ids: [COFFEE],
      saver_id: ALEX,
      voted_by: [ALEX],
      cost_each_minor: 50_000,
    });
    expect(ideas[1]?.poi_ids).toEqual([MARKET]);
    expect(ideas[2]?.poi_ids).toEqual([COFFEE, MARKET]);
    expect(ideas[2]?.reasons).toContainEqual({ code: 'closes_at', params: { time: '18:00' } });
    expect(
      gapIdeasResultSchema.parse({
        who_free: entry.gap.who_free,
        context: { busy: entry.gap.busy, next_item: entry.gap.next_item },
        ideas,
      }),
    ).toBeTruthy();
  });

  it('with nothing that fits, going back to the stay is the option', () => {
    const closed: GapCandidate = {
      place: place(MARKET, POINTS.market, ['08:00', '12:00'], 60),
      source: 'idea',
      costEachMinor: null,
      currency: null,
      saverId: null,
      votedBy: [],
    };
    expect(gapIdeas(BALI, entry, [closed])).toEqual([
      expect.objectContaining({ kind: 'stay', poi_ids: [], cost_each_minor: 0 }),
    ]);
  });
});
