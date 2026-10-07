import { publicRecapSchema, type PublicRecap } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { describe, expect, it } from 'vitest';

import { recapAppPath, recapPlaceRows, recapWords } from './recap-facts';

// Descriptor ids and their values, so the assertions read what was asked for, not the copy.
const t = (descriptor: MessageDescriptor, values?: Record<string, unknown>): string =>
  `${descriptor.id}${values === undefined ? '' : JSON.stringify(values)}`;

const RECAP: PublicRecap = publicRecapSchema.parse({
  kind: 'recap',
  recap_id: '0190a6f1-7aaa-7bbb-8ccc-123456789abd',
  destination_name: 'Đà Lạt',
  travel_month: 10,
  travel_year: 2026,
  days: 3,
  travellers: 4,
  crew_names: ['Anna', 'Ben'],
  distance_m: 41_200,
  distance_estimated: false,
  places_count: 5,
  places: [
    { name: 'Hồ Xuân Hương', category: 'nature' },
    { name: 'Chợ Đà Lạt', category: 'market' },
  ],
  critters_found: 5,
  new_critters: 2,
});

describe('recap words', () => {
  it('says where, when, who and the totals', () => {
    const words = recapWords(RECAP, t);
    expect(words.eyebrow).toBe('web.recap.eyebrowWhen{"when":"October 2026"}');
    expect(words.headline).toBe('web.recap.headline{"place":"Đà Lạt"}');
    expect(words.byline).toBe('web.recap.travelledBy{"names":"Anna and Ben"}');
    expect(words.chips).toEqual([
      'web.recap.days{"days":3}',
      'web.recap.crewOf{"size":4}',
      'web.recap.distance{"km":"41"}',
      'web.recap.critters{"count":5}',
    ]);
    expect(words.morePlaces).toBe('web.recap.morePlaces{"count":3}');
    expect(words.pageDescription).toBe('web.recap.pageDescription{"days":3,"place":"Đà Lạt"}');
  });

  it('leaves out what the recap does not carry, and names nobody who is hidden', () => {
    const words = recapWords(
      {
        ...RECAP,
        destination_name: null,
        travel_month: null,
        travel_year: null,
        days: null,
        travellers: 1,
        crew_names: [],
        distance_m: 0,
        places_count: 0,
        places: [],
        critters_found: 0,
      },
      t,
    );
    expect(words).toMatchObject({
      eyebrow: 'web.recap.eyebrow',
      headline: 'web.recap.headlineNoPlace',
      byline: null,
      chips: ['web.recap.solo'],
      morePlaces: null,
      pageDescription: 'web.recap.pageDescriptionNoPlace',
    });
  });

  it('marks an estimated distance and never shows less than a kilometre', () => {
    const chips = (recap: Partial<PublicRecap>) => recapWords({ ...RECAP, ...recap }, t).chips;
    expect(chips({ distance_estimated: true })).toContain('web.recap.distanceAbout{"km":"41"}');
    expect(chips({ distance_m: 300 })).toContain('web.recap.distance{"km":"1"}');
    expect(chips({ distance_m: 1_234_600 })).toContain('web.recap.distance{"km":"1,235"}');
  });

  it('numbers the places and opens the link on its own screen in the app', () => {
    expect(recapPlaceRows(RECAP).map((row) => [row.no, row.name])).toEqual([
      [1, 'Hồ Xuân Hương'],
      [2, 'Chợ Đà Lạt'],
    ]);
    expect(recapAppPath('DaLatRecap3Days000Token1')).toBe(
      '/app/recap-link/DaLatRecap3Days000Token1',
    );
  });
});
