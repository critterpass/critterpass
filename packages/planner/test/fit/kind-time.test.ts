/**
 * The time of day a place is suggested for: a sunset temple late in the day, a bar after dark, a
 * restaurant at a meal and a morning market in the morning, each on a free day and each still
 * inside its opening hours; a place with no hour of its own from mid-morning on rather than at its
 * opening minute, unless it fills up later; and when its own hours are taken, the nearest slot to
 * them rather than the morning.
 */
import { describe, expect, it } from 'vitest';

import { fitPlace, kindTimeOf, type FitContext, type FitPlace } from '../../src/fit/index';
import { BALI, DAY, POINTS, TIRTA, at, daily } from './bali-fixture';

const place = (extra: Partial<FitPlace>): FitPlace => ({
  poiId: DAY(40),
  point: POINTS.coffee,
  category: 'museum',
  hours: daily('07:00', '22:00'),
  timeNeededMin: 60,
  outdoor: false,
  ...extra,
});

/** The local start on the free Saturday (day 5), "HH:MM". */
function saturdayStart(context: FitContext, candidate: FitPlace): string | null {
  const slot = fitPlace(context, candidate).days.find((day) => day.day_no === 5)?.slot;
  if (slot == null) return null;
  return new Date(Date.parse(slot.starts_at) + 8 * 3_600_000).toISOString().slice(11, 16);
}
const minutes = (clock: string | null) =>
  clock === null ? -1 : Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

const TANAH_LOT = place({
  name: 'Tanah Lot',
  category: 'temple_shrine',
  outdoor: true,
  bestTimeText: 'Sunset hour for golden light',
  bestTime: true,
});
const BAR = place({ name: '40 Thieves', category: 'nightlife', hours: null });
const RESTAURANT = place({ name: 'Naughty Nuri’s Warung', category: 'food', tags: ['sit_down'] });
const MARKET = place({
  name: 'Ubud Market',
  category: 'market',
  bestTimeText: 'Go in the morning while the stalls are fresh',
});

describe('the time of day a place is suggested for', () => {
  it('reads what the place is for from its kind, tags, name and best-time line', () => {
    expect(kindTimeOf(TANAH_LOT, BALI.tz, 60)).toBe('sunset');
    expect(kindTimeOf(BAR, BALI.tz, 90)).toBe('after_dark');
    expect(kindTimeOf(RESTAURANT, BALI.tz, 60)).toBe('meal');
    expect(kindTimeOf(MARKET, BALI.tz, 60)).toBe('morning');
    expect(kindTimeOf(place({ name: 'Blanco Museum' }), BALI.tz, 60)).toBe(null);
  });

  it('puts a sunset temple late in the day, a bar after dark and a restaurant at a meal', () => {
    const sunset = minutes(saturdayStart(BALI, TANAH_LOT));
    expect(sunset).toBeGreaterThanOrEqual(16 * 60 + 30);
    expect(sunset).toBeLessThanOrEqual(18 * 60 + 30);
    expect(minutes(saturdayStart(BALI, BAR))).toBeGreaterThanOrEqual(18 * 60 + 30);
    expect(saturdayStart(BALI, RESTAURANT)).toBe('11:30');
    expect(minutes(saturdayStart(BALI, MARKET))).toBeLessThanOrEqual(11 * 60);
  });

  it('keeps inside the opening hours: a dinner-only kitchen is suggested for dinner', () => {
    const dinnerOnly = { ...RESTAURANT, hours: daily('17:00', '23:00') };
    expect(saturdayStart(BALI, dinnerOnly)).toBe('18:00');
  });

  it('starts a place with no hour of its own mid-morning, not at its opening minute', () => {
    expect(saturdayStart(BALI, place({ name: 'Blanco Museum' }))).toBe('10:00');
    // A place that fills up later is still best early.
    expect(saturdayStart(BALI, TIRTA)).toBe('08:00');
  });

  it('takes the nearest free time when its own hours are booked, never the morning', () => {
    const booked: FitContext = {
      ...BALI,
      days: BALI.days.map((day) =>
        day.dayNo === 5
          ? {
              ...day,
              items: [
                {
                  stableId: DAY(77),
                  poiId: null,
                  category: 'other',
                  startsAt: at(17, '17:30'),
                  endsAt: at(17, '22:00'),
                  attendeeIds: [],
                  locked: true,
                  outdoor: false,
                  point: POINTS.coffee,
                },
              ],
            }
          : day,
      ),
    };
    const openFromNoon = { ...BAR, hours: daily('12:00', '23:00') };
    expect(minutes(saturdayStart(booked, openFromNoon))).toBeGreaterThanOrEqual(15 * 60);
  });

  it('chooses the day that has the place in its own hours over an emptier day that does not', () => {
    // Every evening but Wednesday's is taken (Wednesday's dinner is at 19:30, so the bar fits before).
    const evenings: FitContext = {
      ...BALI,
      days: BALI.days.map((day) =>
        day.dayNo === 5
          ? {
              ...day,
              items: [
                {
                  stableId: DAY(78),
                  poiId: null,
                  category: 'other',
                  startsAt: at(17, '16:00'),
                  endsAt: at(17, '22:00'),
                  attendeeIds: [],
                  locked: true,
                  outdoor: false,
                  point: POINTS.coffee,
                },
              ],
            }
          : day,
      ),
    };
    const sunsetOnly = { ...TANAH_LOT, hours: daily('07:00', '19:00') };
    const fit = fitPlace(evenings, sunsetOnly);
    const best = fit.days.find((day) => day.day_no === fit.best?.day_no);
    const start = new Date(Date.parse(best?.slot?.starts_at ?? '') + 8 * 3_600_000)
      .toISOString()
      .slice(11, 16);
    expect(fit.best?.day_no).not.toBe(5);
    expect(minutes(start)).toBeGreaterThanOrEqual(16 * 60 + 30);
  });
});
