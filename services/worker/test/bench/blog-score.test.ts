import { describe, expect, it } from 'vitest';

import { matchPlace } from '../../bench/blog/match';
import type { Reference, ReferencePlace } from '../../bench/blog/reference';
import {
  coherence,
  coverage,
  dayShape,
  meals,
  missesItsTime,
  overall,
  personalFit,
  timeFit,
  type ScoredDay,
  type ScoredStop,
} from '../../bench/blog/score';

const place = (name: string, over: Partial<ReferencePlace> = {}): ReferencePlace => ({
  index: 0,
  name_en: name,
  category: 'other',
  lat: 11.94,
  lng: 108.44,
  best_times: [],
  tags: [],
  ...over,
});

const stop = (name: string, over: Partial<ScoredStop> = {}): ScoredStop => ({
  poiId: name,
  name,
  kind: 'activity',
  startMin: 600,
  sunsetMin: 17 * 60 + 15,
  lat: 11.94,
  lng: 108.44,
  category: 'other',
  tags: [],
  bestTimes: [],
  mealRole: null,
  area: null,
  ref: null,
  ...over,
});

const day = (stops: ScoredStop[]): ScoredDay => ({ dayNo: 1, theme: 't', stops });

describe('blog benchmark scoring', () => {
  it('counts the blogs’ consensus places the draft holds', () => {
    const lake = place('Xuan Huong Lake', { essential_rank: 1 });
    const market = place('Da Lat Market', { blog_count: 4 });
    const cafe = place('Small Cafe', { blog_count: 1 });
    const reference: Reference = { slug: 'x', places: [lake, market, cafe], days: [], areas: [] };
    expect(coverage([day([stop('a', { ref: lake }), stop('b', { ref: cafe })])], reference)).toBe(
      0.5,
    );
  });

  it('marks a day down for a third area and for returning to an area it left', () => {
    const shape = dayShape(
      day([
        stop('a', { area: 'Centre' }),
        stop('b', { area: 'Lake' }),
        stop('c', { area: 'Centre' }),
        stop('d', { area: 'Hills' }),
      ]),
    );
    expect(shape).toMatchObject({ areas: 3, backtracks: 1 });
    const reference: Reference = { slug: 'x', places: [], days: [], areas: [] };
    const tidy = day([stop('a', { area: 'Centre' }), stop('b', { area: 'Lake' })]);
    expect(coherence([tidy], reference)).toBe(1);
    expect(
      coherence(
        [
          day([
            stop('a', { area: 'Centre' }),
            stop('b', { area: 'Lake' }),
            stop('c', { area: 'Centre' }),
          ]),
        ],
        reference,
      ),
    ).toBe(0.5);
  });

  it('counts a stop as on time only inside one of its best times', () => {
    const days = [
      day([
        stop('market', { bestTimes: ['early_morning'], startMin: 7 * 60 }),
        stop('viewpoint', { bestTimes: ['sunset'], startMin: 10 * 60 }),
        stop('museum', { startMin: 14 * 60 }),
      ]),
    ];
    expect(timeFit(days)).toBe(0.5);
  });

  it('times a sunset stop by the real sunset at the place on the day', () => {
    // London in November: the sun sets at twenty past four.
    const london = { bestTimes: ['sunset'], sunsetMin: 16 * 60 + 20 };
    const golden = stop('primrose hill', { ...london, startMin: 15 * 60 });
    const dark = stop('sky garden', { ...london, startMin: 17 * 60 + 30 });
    expect(missesItsTime(golden)).toBe(false);
    expect(missesItsTime(dark)).toBe(true);
  });

  it('wants a real meal place at lunch and at dinner, not a coffee', () => {
    const lunch = stop('pho', { kind: 'meal', mealRole: 'meal', startMin: 12 * 60 });
    const coffee = stop('cafe', { kind: 'meal', mealRole: 'light', startMin: 19 * 60 });
    expect(meals([day([lunch, coffee])])).toBe(0.5);
  });

  it('scores personal fit by the lift over the neutral draft', () => {
    const neutral = [day([stop('a'), stop('b', { tags: ['markets'] })])];
    const foodie = [day([stop('c', { tags: ['street_food'] }), stop('d', { tags: ['markets'] })])];
    expect(personalFit(foodie, neutral, ['street_food', 'markets'])).toBe(1);
    expect(personalFit(neutral, neutral, ['street_food', 'markets'])).toBe(0.5);
  });

  it('weighs only the metrics a draft has', () => {
    const none = {
      coverage: null,
      coherence: null,
      timeFit: null,
      meals: 1,
      diversity: null,
      personalFit: null,
    };
    expect(overall(none, null)).toBe(100);
    expect(overall(none, 0)).toBeCloseTo((100 * 0.1) / 0.35);
  });
});

describe('blog place matching', () => {
  const places = [
    place('Crazy House', { lat: 11.9352, lng: 108.4307 }),
    place('Linh Phuoc Pagoda', { lat: 11.9446, lng: 108.4993 }),
  ];

  it('matches by shared name words nearby', () => {
    expect(
      matchPlace({ name: 'Hang Nga Crazy House', lat: 11.9356, lng: 108.4312 }, places)?.name_en,
    ).toBe('Crazy House');
  });

  it('falls back to the blog place right beside an unrelated name', () => {
    expect(
      matchPlace({ name: 'Chùa Ve Chai', lat: 11.94462, lng: 108.49931 }, places)?.name_en,
    ).toBe('Linh Phuoc Pagoda');
    expect(matchPlace({ name: 'Chùa Ve Chai', lat: 11.95, lng: 108.49931 }, places)).toBeNull();
  });
});
