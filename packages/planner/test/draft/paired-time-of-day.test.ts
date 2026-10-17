/**
 * Two places our researchers pair, both for the sunset (the lake and the pagoda on its shore), are
 * one outing at sunset: the second follows the first, so they share a day. Two sunset places that
 * are not paired still need a sunset each.
 */
import { describe, expect, it } from 'vitest';

import {
  bestOrder,
  dayWindow,
  scheduleDay,
  validateItinerary,
  type DraftPoi,
} from '../../src/draft/index';
import { FRAME, id, line, place, stop } from './day-sense-fixture';

const SUNSET = 'Late afternoon for sunset';

function day(paired: boolean) {
  const lake = place(41, 'West Lake', 'nature', {
    bestTime: SUNSET,
    durationMin: 120,
    pairsWith: paired ? [id(42)] : [],
  });
  const pagoda = place(42, 'Lakeside Pagoda', 'temple_shrine', {
    bestTime: SUNSET,
    durationMin: 40,
  });
  const pois = new Map<string, DraftPoi>([
    [lake.id, lake],
    [pagoda.id, pagoda],
  ]);
  const travel = line({ [lake.id]: 0, [pagoda.id]: 5 });
  const input = {
    date: FRAME.dates[1] as string,
    choices: [stop(lake), stop(pagoda)],
    pois,
    window: dayWindow(FRAME, 1),
    travel,
  };
  const { order, broken } = bestOrder(input);
  let next = 0;
  const timed = scheduleDay({
    ...input,
    dayNo: 2,
    theme: 'A day',
    choices: order.map((index) => input.choices[index]!),
    bands: null,
    currency: FRAME.currency,
    tz: FRAME.tz,
    idFor: () => id(1000 + (next += 1)),
  });
  const codes = validateItinerary({
    itinerary: { currency: FRAME.currency, days: [timed] },
    pois,
    frame: FRAME,
    travel,
    requiredMustDoIds: [],
  }).violations.map((v) => v.code);
  return { broken, codes };
}

describe('paired places held to one time of day', () => {
  it('share the sunset as one outing', () => {
    const { broken, codes } = day(true);
    expect(broken).toBe(0);
    expect(codes).not.toContain('WRONG_TIME_OF_DAY');
  });

  it('need a sunset each when nobody pairs them', () => {
    const { broken, codes } = day(false);
    expect(broken).toBeGreaterThan(0);
    expect(codes).toContain('WRONG_TIME_OF_DAY');
  });
});
