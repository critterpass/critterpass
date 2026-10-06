import { describe, expect, it } from 'vitest';

import { buildSharedPlanProjection, roundCostPerPerson, type PlanSkeleton } from './projection';
import { scrubPublicText } from './scrub';

const skeleton: PlanSkeleton = {
  destination_id: '0191f0a0-0000-7000-8000-000000000001',
  destination_name: 'Kyoto',
  start_date: '2026-04-03',
  end_date: '2026-04-05',
  first_names: ['Mia', 'Tom', 'Ana'],
  days: [
    {
      day_no: 1,
      theme: 'Temples, then dinner at 12 Kiyamachi Street (call +81 75 123 4567, ref QX7P2K)',
      places: [
        {
          poi_id: '0191f0a0-0000-7000-8000-000000000011',
          name: 'Kinkaku-ji',
          category: 'temple_shrine',
        },
        { poi_id: '0191f0a0-0000-7000-8000-000000000012', name: 'Nishiki', category: 'market' },
      ],
    },
    {
      day_no: 2,
      theme: null,
      places: [
        {
          poi_id: '0191f0a0-0000-7000-8000-000000000013',
          name: 'Ryoan-ji',
          category: 'temple_shrine',
        },
      ],
    },
  ],
  cost_pp_minor: 123_456,
  currency: 'USD',
  currency_exponent: 2,
  photo_keys: Array.from({ length: 15 }, (_, i) => `photos/${i}.jpg`),
  tips: [{ poi_id: '0191f0a0-0000-7000-8000-000000000011', text: 'Mail me at mia@example.com' }],
  travelled: true,
};

describe('buildSharedPlanProjection', () => {
  it('keeps names off by default and never carries notes, phones or booking refs', () => {
    const projection = buildSharedPlanProjection(skeleton, {
      names: false,
      costs: true,
      photos: true,
    });
    const text = JSON.stringify(projection);
    expect(projection.crew_names).toBeNull();
    expect(projection.crew_size).toBe(3);
    for (const leak of ['Mia', 'Tom', '4567', 'QX7P2K', 'Kiyamachi', 'mia@example.com']) {
      expect(text).not.toContain(leak);
    }
  });

  it('shows first names, rounded cost and at most 12 photos when the crew allows', () => {
    const projection = buildSharedPlanProjection(skeleton, {
      names: true,
      costs: true,
      photos: true,
    });
    expect(projection.crew_names).toEqual(['Mia', 'Tom', 'Ana']);
    expect(projection.cost_pp_rounded_minor).toBe(124_000);
    expect(projection.photos).toHaveLength(12);
    expect(projection).toMatchObject({ days_count: 2, travel_month: 4, travel_year: 2026 });
    expect(projection.tags[0]).toBe('easy_pace');
    expect(projection.tags).toContain('temples');
  });

  it('drops cost and photos when toggled off', () => {
    const projection = buildSharedPlanProjection(skeleton, {
      names: false,
      costs: false,
      photos: false,
    });
    expect(projection.cost_pp_rounded_minor).toBeNull();
    expect(projection.currency).toBeNull();
    expect(projection.photos).toEqual([]);
  });
});

describe('roundCostPerPerson', () => {
  it('rounds to 10 major units in the currency exponent', () => {
    expect(roundCostPerPerson(1_234_567, 0)).toBe(1_234_570);
    expect(roundCostPerPerson(400, 2)).toBe(1_000);
  });
});

describe('scrubPublicText', () => {
  it('keeps ordinary travel words', () => {
    expect(scrubPublicText('Go early, the moss garden is quiet before 9')).toBe(
      'Go early, the moss garden is quiet before 9',
    );
  });

  it('masks links and emails', () => {
    expect(scrubPublicText('see www.example.com or a@b.co')).toBe('see … or …');
  });
});
