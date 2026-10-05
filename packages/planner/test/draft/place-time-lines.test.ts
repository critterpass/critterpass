/**
 * Reading our editors' best-time lines as staging's catalogue writes them: "late afternoon" is the
 * hour before sunset, a sunset or evening word wins over "afternoon", and a line naming two times
 * holds a stop to either of them, never to none (a temple "for sunset" is not visited at 07:15).
 */
import { describe, expect, it } from 'vitest';

import { placeTimes, placeWindows } from '../../src/draft/index';
import { place } from './day-sense-fixture';

const times = (bestTime: string, category = 'temple_shrine') =>
  placeTimes(place(1, 'A place', category, { bestTime }));

describe('best-time lines', () => {
  it('read late afternoon as the sunset, over the afternoon', () => {
    expect(times('Late afternoon for sunset')).toEqual(['sunset']);
    expect(times('Sunset: be on the sand by about 17:30', 'beach')).toEqual(['sunset']);
    expect(times('Afternoon tea or early evening for sunset views', 'nature')).toEqual(['sunset']);
    expect(times('Afternoon or late evening', 'nature')).toEqual(['evening']);
  });

  it('read a line naming two times as either of them', () => {
    expect(times('Early morning or late afternoon, to avoid the heat')).toEqual([
      'morning',
      'sunset',
    ]);
    expect(times('Arrive at opening or late afternoon to avoid peak heat')).toEqual([
      'morning',
      'sunset',
    ]);
    expect(times('Early morning before tour buses or late afternoon for softer light')).toEqual([
      'morning',
      'sunset',
    ]);
  });

  it('read any time, or the middle of the day, as no time of its own', () => {
    expect(times('Any time; less crowded late afternoon')).toEqual([]);
    expect(times('Midday, when the light reaches the cave floor', 'nature')).toEqual([]);
    expect(times('Afternoon, after the tour groups leave', 'museum')).toEqual([]);
  });

  it('give a stop the windows of those times, and none in between', () => {
    const date = '2026-10-21';
    const sunsetOnly = placeWindows(
      place(2, 'Sea temple', 'temple_shrine', {
        bestTime: 'Late afternoon for sunset',
        lat: -8.62,
        lng: 115.09,
        tz: 'Asia/Makassar',
      }),
      date,
    );
    expect(sunsetOnly).toHaveLength(1);
    expect(sunsetOnly[0]?.fromMin).toBeGreaterThan(15 * 60);
    const beach = placeWindows(
      place(3, 'Beach', 'beach', {
        bestTime: 'Early morning for calm water and fewer crowds, or late afternoon for sunset.',
        durationMin: 120,
      }),
      date,
    );
    expect(beach).toHaveLength(2);
    expect(beach[0]?.toMin).toBeLessThanOrEqual(11 * 60);
    expect(beach[1]?.fromMin).toBeGreaterThanOrEqual(15 * 60);
  });
});
