import { describe, expect, it } from '@jest/globals';

import { liveFacts, parsePlaceLive, placeLiveParser, type PlaceLive } from '../place-live';

const span = [{ start: '09:00', end: '17:00' }];
const week = { weekly: { mo: span, tu: span, we: span, th: span, fr: span, sa: span, su: span } };

const FULL = {
  available: true,
  openNow: true,
  closedPermanently: false,
  hours: week,
  priceLevel: 2,
  rating: 8.6,
  photos: [
    { url: 'https://fastly.4sqi.net/img/a.jpg', width: 800, height: 600 },
    { url: 'https://fastly.4sqi.net/img/b.jpg', width: 600, height: 800 },
  ],
  tips: [{ text: 'Go at sunset.', createdAt: '2026-09-01T10:00:00Z' }],
  website: 'https://example.vn',
  phone: '+84 236 123 456',
  popularity: null,
  attribution: { name: 'Foursquare', url: 'https://foursquare.com/v/abc' },
};

const own = { hours: null, priceLevel: null, hasPhoto: false };

function parsed(body: unknown): PlaceLive {
  const result = parsePlaceLive(body);
  if (result === null) throw new Error('expected a parse');
  return result;
}

describe('reading the live place answer', () => {
  it('reads a full answer, capped, and ignores popularity', () => {
    const live = parsed({
      ...FULL,
      photos: Array.from({ length: 8 }, (_, i) => ({
        url: `https://x.test/${i}.jpg`,
        width: 4,
        height: 3,
      })),
      tips: Array.from({ length: 5 }, (_, i) => ({ text: `tip ${i}`, createdAt: '' })),
    });
    expect(live.available).toBe(true);
    expect(live.photos).toHaveLength(5);
    expect(live.tips).toHaveLength(3);
    expect(live).not.toHaveProperty('popularity');
  });

  it('reads a bare or unavailable answer as having nothing', () => {
    expect(parsed({ available: false })).toMatchObject({
      available: false,
      photos: [],
      tips: [],
      rating: null,
      hours: null,
      attribution: null,
    });
    expect(parsed({})).toMatchObject({ available: false, photos: [], phone: null });
  });

  it('drops malformed fields instead of failing the whole answer', () => {
    const live = parsed({
      ...FULL,
      rating: 42,
      priceLevel: 9,
      hours: { weekly: 'always' },
      website: 'javascript:alert(1)',
      photos: [{ url: 'https://x.test/a.jpg' }, 'nope'],
      tips: [{ text: '  ' }],
    });
    expect(live).toMatchObject({
      rating: null,
      priceLevel: null,
      hours: null,
      website: null,
      photos: [],
      tips: [],
    });
  });

  it('fails only a body that is not an object, as an error page would be', () => {
    expect(placeLiveParser.safeParse('Not Found').success).toBe(false);
    expect(placeLiveParser.safeParse(null).success).toBe(false);
    expect(placeLiveParser.safeParse([]).success).toBe(false);
  });
});

describe('what the page shows from it', () => {
  it('shows nothing live while loading, on a 404 or when unavailable', () => {
    for (const live of [null, undefined, parsed({ ...FULL, available: false })]) {
      expect(liveFacts(live, { hours: week, priceLevel: 0, hasPhoto: false })).toEqual({
        hours: week,
        openNow: null,
        closedPermanently: false,
        priceLevel: 0,
        heroUrl: null,
        details: null,
      });
    }
  });

  it('prefers our own hours, price and photo over the live ones', () => {
    const facts = liveFacts(parsed(FULL), { hours: week, priceLevel: 0, hasPhoto: true });
    expect(facts.hours).toBe(week);
    expect(facts.openNow).toBeNull();
    expect(facts.priceLevel).toBe(0);
    expect(facts.heroUrl).toBeNull();
    expect(facts.details?.photos).toHaveLength(2);
  });

  it('fills the gaps from the live answer, the first photo going to the hero', () => {
    const facts = liveFacts(parsed(FULL), own);
    expect(facts.hours).toEqual(week);
    expect(facts.priceLevel).toBe(2);
    expect(facts.heroUrl).toBe('https://fastly.4sqi.net/img/a.jpg');
    expect(facts.details).toEqual({
      rating: 8.6,
      photos: [FULL.photos[1]],
      tips: FULL.tips,
      phone: '+84 236 123 456',
      website: 'https://example.vn',
      attribution: FULL.attribution,
    });
  });

  it('uses live open-now only when no hours are known', () => {
    expect(liveFacts(parsed({ ...FULL, hours: null }), own).openNow).toBe(true);
    expect(liveFacts(parsed(FULL), own).openNow).toBeNull();
  });

  it('hides every block without data, and credits Foursquare when anything shows', () => {
    expect(liveFacts(parsed({ available: true }), own).details).toBeNull();
    const ratingOnly = liveFacts(parsed({ available: true, rating: 7.1 }), own).details;
    expect(ratingOnly).toEqual({
      rating: 7.1,
      photos: [],
      tips: [],
      phone: null,
      website: null,
      attribution: { name: 'Foursquare', url: 'https://foursquare.com' },
    });
  });
});
