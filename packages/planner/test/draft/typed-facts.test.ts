/**
 * The planner's own rules over typed place facts: what food a place is to a day, the time of day
 * it holds a stop to, and how much it needs the start of the day.
 */
import type { PlaceBestTime, PlaceMealRole } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { earlyNeed, foodRole, kindFacts, placeTimes, withTypedFacts } from '../../src/draft/index';
import { place } from './day-sense-fixture';

const typed = (
  category: string,
  bestTimes: readonly PlaceBestTime[],
  mealRole: PlaceMealRole | null = null,
  extra: { visitMin?: number; tags?: string[] } = {},
) =>
  withTypedFacts(place(1, 'A place', category, { tags: extra.tags ?? [] }), {
    profile: { bestTimes, visitMin: extra.visitMin ?? null, mealRole, dish: null },
    editorsVisitMin: null,
    essentialRank: null,
  });

describe('typed food role', () => {
  it('makes a quick food stop a snack unless it is a table', () => {
    expect(foodRole(typed('food', [], 'meal', { visitMin: 20 }))).toBe('light');
    expect(foodRole(typed('food', [], 'meal', { visitMin: 20, tags: ['sit_down'] }))).toBe('meal');
    expect(foodRole(typed('food', [], 'meal', { visitMin: 60 }))).toBe('meal');
  });

  it('never makes a market or a sight the day’s meal, nor a venue a break', () => {
    expect(foodRole(typed('market', [], 'meal'))).toBeNull();
    expect(foodRole(typed('nightlife', [], 'light'))).toBeNull();
    expect(foodRole(typed('nightlife', [], 'meal'))).toBe('meal');
    // A place filed as food is food, whatever its role says.
    expect(foodRole(typed('food', [], 'none'))).toBe('meal');
  });

  it('reads a cafe from its tags until it has a profile', () => {
    expect(kindFacts('food', ['cafe']).mealRole).toBe('light');
    expect(kindFacts('food', ['cafe', 'sit_down']).mealRole).toBe('meal');
    expect(kindFacts('museum', []).mealRole).toBe('none');
  });
});

describe('typed time of day', () => {
  it('holds nothing for a place good at midday, or all afternoon with nothing later', () => {
    expect(placeTimes(typed('museum', ['morning', 'midday', 'afternoon']))).toEqual([]);
    expect(placeTimes(typed('museum', ['afternoon']))).toEqual([]);
  });

  it('narrows an afternoon to a late time, and keeps a morning beside it', () => {
    expect(placeTimes(typed('beach', ['afternoon', 'sunset']))).toEqual(['sunset']);
    expect(placeTimes(typed('nature', ['early_morning', 'sunset']))).toEqual(['morning', 'sunset']);
    expect(placeTimes(typed('other', ['evening', 'after_dark']))).toEqual(['after_dark']);
  });

  it('keeps a night venue late even when it is good at noon too', () => {
    expect(placeTimes(typed('nightlife', ['midday', 'sunset', 'evening']))).toEqual(['after_dark']);
    expect(placeTimes(typed('nightlife', []))).toEqual(['after_dark']);
  });

  it('lets a meal place follow meal times', () => {
    expect(placeTimes(typed('food', ['evening'], 'meal'))).toEqual([]);
  });

  it('asks for the start of the day only for a morning place', () => {
    expect(earlyNeed(typed('nature', ['early_morning', 'morning']))).toBe(2);
    expect(earlyNeed(typed('nature', ['morning', 'sunset']))).toBe(1);
    expect(earlyNeed(typed('museum', ['early_morning', 'midday']))).toBe(0);
  });
});
