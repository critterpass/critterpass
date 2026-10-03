import { describe, expect, it } from 'vitest';

import {
  FOURSQUARE_ATTRIBUTION,
  foursquareHoursToHours,
  mapFoursquareDetails,
  nameSimilarity,
  openAt,
  pickFoursquareMatch,
  placeLiveSchema,
  UNAVAILABLE_PLACE_LIVE,
} from '../../src';

// A real Place Details response (Fushimi Inari Taisha, Kyoto), recorded 2026-10-03.
import recorded from './fixtures/foursquare-place-details.json' with { type: 'json' };

describe('mapFoursquareDetails', () => {
  it('maps a recorded Place Details response into the live shape', () => {
    const live = mapFoursquareDetails(recorded);
    expect(placeLiveSchema.parse(live)).toEqual(live);
    expect(live.available).toBe(true);
    expect(live.rating).toBe(9.5);
    expect(live.website).toBe('http://inari.jp');
    expect(live.phone).toBe('075-641-7331');
    expect(live.closedPermanently).toBe(false);
    expect(live.popularity).toBeNull();
    expect(live.attribution).toEqual(FOURSQUARE_ATTRIBUTION);
    expect(live.photos.length).toBeGreaterThan(0);
    expect(live.photos.length).toBeLessThanOrEqual(5);
    expect(live.tips.length).toBeLessThanOrEqual(3);
    // 24 hours every day: open at 03:00 local on a Wednesday.
    expect(live.hours).not.toBeNull();
    expect(openAt(live.hours!, 'Asia/Tokyo', new Date('2026-10-07T18:00:00Z'))).toBe(true);
  });

  it('sizes photos to a 1080 px long edge and keeps the aspect ratio', () => {
    const live = mapFoursquareDetails({
      photos: [
        {
          prefix: 'https://fastly.4sqi.net/img/general/',
          suffix: '/a.jpg',
          width: 1440,
          height: 1920,
        },
        {
          prefix: 'https://fastly.4sqi.net/img/general/',
          suffix: '/b.jpg',
          width: 640,
          height: 480,
        },
        { prefix: 'not a photo' },
      ],
    });
    expect(live.photos).toEqual([
      { url: 'https://fastly.4sqi.net/img/general/810x1080/a.jpg', width: 810, height: 1080 },
      { url: 'https://fastly.4sqi.net/img/general/640x480/b.jpg', width: 640, height: 480 },
    ]);
  });

  it('reads a closed place as closed now, whatever its hours say', () => {
    const live = mapFoursquareDetails({ date_closed: '2025-01-01', hours: { open_now: true } });
    expect(live.closedPermanently).toBe(true);
    expect(live.openNow).toBe(false);
  });

  it('drops malformed fields instead of failing the whole response', () => {
    const live = mapFoursquareDetails({ rating: 'great', price: 9, tips: [{ text: '' }], tel: '' });
    expect(live).toEqual({
      ...UNAVAILABLE_PLACE_LIVE,
      available: true,
      attribution: FOURSQUARE_ATTRIBUTION,
    });
  });
});

describe('foursquareHoursToHours', () => {
  it('keeps split and overnight spans, and a next-day midnight close as 24:00', () => {
    const hours = foursquareHoursToHours([
      { day: 1, open: '1130', close: '1430' },
      { day: 1, open: '1700', close: '2200' },
      { day: 5, open: '2000', close: '+0200' },
      { day: 6, open: '1800', close: '+0000' },
    ]);
    expect(hours).toEqual({
      weekly: {
        mo: [
          { start: '11:30', end: '14:30' },
          { start: '17:00', end: '22:00' },
        ],
        fr: [{ start: '20:00', end: '02:00' }],
        sa: [{ start: '18:00', end: '24:00' }],
      },
    });
    // Friday 01:00 into Saturday is still open (Lisbon, UTC+1 in October).
    expect(openAt(hours!, 'Europe/Lisbon', new Date('2026-10-10T00:00:00Z'))).toBe(true);
  });

  it('is unknown (null) rather than closed all week when nothing is readable', () => {
    expect(foursquareHoursToHours([])).toBeNull();
    expect(foursquareHoursToHours([{ day: 9, open: 'noon', close: 'late' }])).toBeNull();
  });
});

describe('pickFoursquareMatch', () => {
  const candidates = [
    { fsqPlaceId: 'station', name: 'Fushimi-Inari Station (KH 34) (伏見稲荷駅)', distance: 120 },
    { fsqPlaceId: 'shrine', name: 'Fushimi Inari Taisha (伏見稲荷大社)', distance: 47 },
    { fsqPlaceId: 'cafe', name: 'Inari Saryo (稲荷茶寮)', distance: 115 },
  ];

  it('picks the place whose name matches ours, by its English or local-script name', () => {
    expect(pickFoursquareMatch(['Fushimi Inari Taisha'], candidates)?.fsqPlaceId).toBe('shrine');
    expect(
      pickFoursquareMatch(['Fushimi Inari Shrine', '伏見稲荷大社'], candidates)?.fsqPlaceId,
    ).toBe('shrine');
  });

  it('refuses a weak name match or a candidate outside the radius', () => {
    expect(pickFoursquareMatch(['Kiyomizu-dera'], candidates)).toBeNull();
    expect(
      pickFoursquareMatch(['Fushimi Inari Taisha'], [{ ...candidates[1]!, distance: 900 }]),
    ).toBeNull();
  });

  it('scores accents and punctuation away', () => {
    expect(nameSimilarity(['Café A Brasileira'], 'Cafe a Brasileira')).toBe(1);
  });
});
