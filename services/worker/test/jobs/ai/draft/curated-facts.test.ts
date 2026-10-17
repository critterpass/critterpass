/**
 * A curated place is planned from its researchers' facts over its AI profile's: their times of
 * day, meal role, dish and essential rank win where the line has them, the profile fills what the
 * line left out, and a first-version line (none of them) leaves the profile as it was.
 */
import type { CuratedNote } from '@cp/domain';
import { withTypedFacts, type DraftPoi, type ProfileFacts } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import {
  curatedCategory,
  curatedMustSee,
  curatedPlaceFacts,
  essentialRankOf,
  tagsWithCurated,
  typedFactsWithCurated,
} from '../../../../src/jobs/ai/draft/curated-facts';

const poi: DraftPoi = {
  id: 'p1',
  name: 'Chợ Đà Lạt',
  nameLocal: null,
  category: 'food',
  lat: 11.94,
  lng: 108.43,
  tz: 'Asia/Ho_Chi_Minh',
  hours: null,
  priceLevel: null,
  tags: ['street_food'],
  durationMin: 60,
  editorial: true,
  mustSee: false,
  detail: 3,
  whyGo: null,
  bestTime: null,
};

const profile: ProfileFacts = {
  bestTimes: ['midday'],
  visitMin: 45,
  mealRole: 'meal',
  dish: 'bánh căn',
};

const curated = (extra: Partial<CuratedNote>): CuratedNote => ({ rank: 1, ...extra });

const planned = (note: CuratedNote | null, essential = false) =>
  withTypedFacts(
    { ...poi, tags: tagsWithCurated(poi.tags, note) },
    {
      profile: typedFactsWithCurated(profile, note),
      editorsVisitMin: 90,
      essentialRank: essentialRankOf(note, essential),
    },
  );

describe('a curated place’s typed facts', () => {
  it('takes the researchers’ times, meal role, dish and rank over the profile’s', () => {
    const place = planned(
      curated({
        best_times: ['after_dark'],
        meal_role: 'light',
        dish: 'bánh tráng nướng',
        essential_rank: 3,
        tags: ['markets', 'street_food'],
      }),
    );
    expect(place).toMatchObject({
      bestTimes: ['after_dark'],
      mealRole: 'light',
      dish: 'bánh tráng nướng',
      essentialRank: 3,
      // The editors' visit length (the curated line's) still wins over the profile's.
      visitMin: 90,
      tags: ['street_food', 'markets'],
    });
  });

  it('keeps the profile’s facts where the line has none', () => {
    const place = planned(curated({ dish: 'bánh căn nướng' }));
    expect(place).toMatchObject({ bestTimes: ['midday'], mealRole: 'meal' });
  });

  it('reads a line with times of day and no meal role as a place that is no eatery', () => {
    // A tower matched to the restaurant inside it: its profile describes the restaurant.
    expect(typedFactsWithCurated(profile, curated({ best_times: ['sunset'] }))).toEqual({
      bestTimes: ['sunset'],
      visitMin: 45,
      mealRole: null,
      dish: null,
    });
  });

  it('plans a first-version line, or no curated block, from the profile alone', () => {
    for (const note of [curated({ area: 'Market' }), null]) {
      expect(planned(note, true)).toMatchObject({
        bestTimes: ['midday'],
        mealRole: 'meal',
        dish: 'bánh căn',
        essentialRank: 1,
        tags: ['street_food'],
      });
    }
  });

  it('plans from the line alone when the place has no profile', () => {
    const note = curated({ best_times: ['morning'], meal_role: 'meal', dish: 'phở' });
    expect(typedFactsWithCurated(null, note)).toEqual({
      bestTimes: ['morning'],
      visitMin: null,
      mealRole: 'meal',
      dish: 'phở',
    });
    expect(typedFactsWithCurated(null, curated({}))).toBeNull();
  });
});

describe('what a curated line tells the planner beyond typed facts', () => {
  it('counts essentials, icons and places on three or more pages among the must-sees', () => {
    expect(curatedMustSee(curated({ essential_rank: 5 }))).toBe(true);
    expect(curatedMustSee(curated({ prominence: 'icon' }))).toBe(true);
    expect(curatedMustSee(curated({ blog_count: 3 }))).toBe(true);
    expect(curatedMustSee(curated({ prominence: 'popular', blog_count: 2 }))).toBe(false);
    expect(curatedMustSee(null)).toBe(false);
  });

  it('decides from the meal role whether a row open data files as a restaurant is one', () => {
    const sight = (tags: CuratedNote['tags']) => curated({ best_times: ['evening'], tags });
    expect(curatedCategory('food', sight(['nightlife', 'culture']))).toBe('nightlife');
    expect(curatedCategory('food', sight(['markets', 'shopping']))).toBe('market');
    expect(curatedCategory('food', sight(['photo_spots']))).toBe('other');
    expect(curatedCategory('food', curated({ meal_role: 'meal' }))).toBe('food');
    // A sight or an eatery filed as a hotel or a station is the place the researchers meant.
    expect(curatedCategory('stay', sight(['culture']))).toBe('other');
    expect(curatedCategory('transit', curated({ meal_role: 'light' }))).toBe('food');
    expect(curatedCategory('museum', sight(['nightlife']))).toBe('museum');
    expect(curatedCategory('stay', null)).toBe('stay');
  });

  it('plans a curated place as the kind the researcher found it to be', () => {
    // Khao San Road filed as a restaurant is a night out, meal role or not.
    expect(curatedCategory('food', curated({ meal_role: 'light' }), 'nightlife')).toBe('nightlife');
    expect(curatedCategory('stay', curated({}), 'food')).toBe('food');
    expect(curatedCategory('other', curated({}), 'museum')).toBe('museum');
  });

  it('never lets a researched other replace a kind open data knows', () => {
    expect(curatedCategory('museum', curated({}), 'other')).toBe('museum');
    expect(curatedCategory('nature', curated({}), 'other')).toBe('nature');
    // Where open data's kind is no sight, the line decides as before.
    const night = curated({ best_times: ['evening'], tags: ['nightlife'] });
    expect(curatedCategory('food', night, 'other')).toBe('nightlife');
    expect(curatedCategory('stay', curated({ tags: ['culture'] }), 'other')).toBe('other');
  });

  it('carries the area, standing, pages, rain fit and the matched pairs only', () => {
    expect(
      curatedPlaceFacts(
        curated({
          area: 'Center and Xuan Huong Lake',
          prominence: 'local_favourite',
          blog_count: 0,
          indoor: true,
          pairs_with: [
            { name: 'Dalat Market', poi_id: '0199b000-0000-7000-8000-000000000001' },
            { name: 'Unmatched' },
          ],
        }),
      ),
    ).toEqual({
      area: 'Center and Xuan Huong Lake',
      prominence: 'local_favourite',
      blogCount: 0,
      indoor: true,
      pairsWith: ['0199b000-0000-7000-8000-000000000001'],
    });
    expect(curatedPlaceFacts(curated({}))).toEqual({});
  });
});
