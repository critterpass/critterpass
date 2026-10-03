/**
 * Eight saved places for the Bali crew (../fit/bali-fixture.ts): six fit without moving anything,
 * one the crew is split on, and one open only when the crew is at the locked terraces day.
 */
import type { FitPlace } from '../../src/fit/index';
import type { PlacementIdea } from '../../src/placement/index';
import { daily, POINTS, TIRTA, VILLA } from '../fit/bali-fixture';

export const idea = (n: number) => `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`;
const poi = (n: number) => `00000000-0000-4000-8000-0000000d${String(n).padStart(4, '0')}`;

export const near = (dLat: number, dLng: number) => ({
  lat: VILLA.lat + dLat,
  lng: VILLA.lng + dLng,
});

export const place = (n: number, extra: Partial<FitPlace> = {}): FitPlace => ({
  poiId: poi(n),
  point: near(n / 1000, -n / 1000),
  category: 'museum',
  hours: daily('09:00', '17:00'),
  timeNeededMin: 60,
  outdoor: false,
  ...extra,
});

/** Eight saved places: six that fit, one the crew is split on, one that only fits by moving. */
export const EIGHT: PlacementIdea[] = [
  { ideaId: idea(1), place: { ...TIRTA } },
  { ideaId: idea(2), place: place(2) },
  { ideaId: idea(3), place: place(3, { category: 'food', hours: daily('11:00', '22:00') }) },
  { ideaId: idea(4), place: place(4, { hours: daily('10:00', '14:00') }) },
  // A night market.
  { ideaId: idea(5), place: place(5, { category: 'market', hours: daily('17:00', '22:00') }) },
  { ideaId: idea(6), place: place(6, { timeNeededMin: 120 }) },
  { ideaId: idea(7), place: place(7, { stances: { want: 3, ratherNot: 2 } }) },
  // Open only on Thursday morning, when the crew is at the locked terraces day.
  {
    ideaId: idea(8),
    place: place(8, {
      point: POINTS.coffee,
      hours: { weekly: { th: [{ start: '09:00', end: '11:00' }] } },
    }),
  },
];
