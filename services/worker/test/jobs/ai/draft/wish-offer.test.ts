/**
 * A typed must-do still without a place when the draft starts (its check found none, or has not
 * run yet) is offered to the guide with the places it may mean, so the guide can answer it: a dish
 * ("Mi Quang for breakfast") is offered the curated eateries known for that dish, and a named
 * place is offered, never placed from the words.
 */
import { destinationPhrases, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { wishOffer } from '../../../../src/jobs/ai/draft/plan-input';

const id = (n: number) => `0199c000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const IGNORE = destinationPhrases('Đà Nẵng, Vietnam');

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
const BANH_XEO = place(3, 'Bánh Xèo Bà Dưỡng', 'food', { ...meal, dish: 'Bánh xèo' });
const MARBLE = place(4, 'Marble Mountains', 'temple_shrine');
const CANDIDATES = [BA_MUA, ONG_HAI, BANH_XEO, MARBLE];

describe('what the guide is offered for an open typed must-do', () => {
  it('offers a dish wish the curated eateries known for the dish', () => {
    const offer = wishOffer([{ id: 'w', text: 'Mi Quang for breakfast' }], CANDIDATES, IGNORE);
    expect(offer.places.size).toBe(0);
    expect([...(offer.options.get('w') ?? [])].sort()).toEqual([BA_MUA.id, ONG_HAI.id].sort());
    expect(offer.offered).toEqual(expect.arrayContaining([BA_MUA.id, ONG_HAI.id]));
    expect(offer.offered).not.toContain(BANH_XEO.id);
  });

  it('offers the one place a wish names without placing it', () => {
    const offer = wishOffer([{ id: 'w', text: 'Marble Mountains at sunrise' }], CANDIDATES, IGNORE);
    expect(offer.places.size).toBe(0);
    expect(offer.options.get('w')).toContain(MARBLE.id);
    expect(offer.offered).toContain(MARBLE.id);
  });
});
