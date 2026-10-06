/**
 * On a trip planned in day groups, a typed must-do still without a place is offered to the guide
 * with the places it may mean, as on a trip of one destination: in the group whose places it
 * names, from that group's places only, and never placed from the words.
 */
import { destinationPhrases, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { groupWishes, type WishGroup } from '../../../../src/jobs/ai/draft/group-wishes';

const id = (n: number) => `0199c000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const place = (n: number, name: string, category: string, typed?: Partial<DraftPoi>): DraftPoi => ({
  id: id(n),
  name,
  category,
  lat: 16.06 + n / 1000,
  lng: 108.22,
  tz: 'Asia/Ho_Chi_Minh',
  hours: null,
  priceLevel: null,
  tags: [],
  durationMin: 60,
  editorial: true,
  mustSee: false,
  ...typed,
});

const meal = { bestTimes: ['morning', 'midday'] as const, mealRole: 'meal' as const };
const BA_MUA = place(1, 'Quán Bà Mua', 'food', { ...meal, dish: 'Mì Quảng' });
const ONG_HAI = place(2, 'Ông Hai', 'food', { ...meal, dish: 'mì quảng' });
const MARBLE = place(3, 'Marble Mountains', 'temple_shrine');
const CITADEL = place(4, 'Imperial Citadel', 'landmark');
const THIEN_MU = place(5, 'Thiên Mụ Pagoda', 'temple_shrine', { editorial: false });
const DONG_BA = place(6, 'Đông Ba Market', 'market');

const DA_NANG: WishGroup = {
  ignore: destinationPhrases('Đà Nẵng, Vietnam'),
  places: [MARBLE],
  candidates: [BA_MUA, ONG_HAI, MARBLE],
};
const HUE: WishGroup = {
  ignore: destinationPhrases('Huế, Vietnam'),
  places: [CITADEL, DONG_BA],
  candidates: [THIEN_MU],
};

const WISHES = [
  { id: 'dish', text: 'Mi Quang for breakfast' },
  { id: 'pagoda', text: 'Thien Mu Pagoda at sunset' },
  { id: 'citadel', text: 'the Imperial Citadel' },
  { id: 'nothing', text: 'somewhere quiet to read' },
];

describe('open typed must-dos on a trip of two stops', () => {
  const wished = groupWishes(WISHES, [DA_NANG, HUE]);
  const [first, second] = wished.offers;

  it('sends a wish to the stop whose places it names, and the rest to the first', () => {
    expect(Object.fromEntries(wished.home)).toEqual({
      dish: 0,
      pagoda: 1,
      citadel: 1,
      nothing: 0,
    });
  });

  it('offers a dish wish the eateries of its own stop known for the dish', () => {
    expect([...(first?.options.get('dish') ?? [])].sort()).toEqual([BA_MUA.id, ONG_HAI.id].sort());
    expect(first?.offered).toEqual(expect.arrayContaining([BA_MUA.id, ONG_HAI.id]));
  });

  it('offers a wish the place our search found in the second city, without placing it', () => {
    expect(second?.options.get('pagoda')).toContain(THIEN_MU.id);
    expect(second?.offered).toContain(THIEN_MU.id);
    expect(second?.places.size).toBe(0);
    expect(first?.places.size).toBe(0);
  });

  it('never offers a wish a place of another stop', () => {
    expect(first?.options.has('pagoda')).toBe(false);
    expect(second?.options.has('dish')).toBe(false);
    const firstStop = new Set(DA_NANG.candidates.map((poi) => poi.id));
    expect(second?.offered.some((poiId) => firstStop.has(poiId))).toBe(false);
  });
});

describe('open typed must-dos on a trip of one group', () => {
  it('all stay with it', () => {
    const wished = groupWishes(WISHES, [DA_NANG]);
    expect([...wished.home.values()]).toEqual([0, 0, 0, 0]);
    expect(wished.offers[0]?.options.get('dish')).toHaveLength(2);
  });
});
