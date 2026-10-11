import { describe, expect, it } from '@jest/globals';

import { splitTrips, tripStage, type PremiumTripRow } from '../trips-model';

const row = (id: string, status: string, place: string | null = 'Bali'): PremiumTripRow => ({
  id,
  crew_id: 'c',
  status,
  start_date: null,
  end_date: null,
  tz: null,
  plan_progress: 0,
  destination_name: place,
  destination_slug: null,
  guide_slug: null,
});

describe('the premium trips list', () => {
  const rows = [
    row('live', 'in_trip'),
    row('kyoto', 'confirmed'),
    row('vote', 'voting', null),
    row('lisbon', 'post_trip'),
    row('off', 'cancelled'),
  ];

  it('leads with the live trip, then what is ahead, then what is over, never the called-off', () => {
    const lists = splitTrips(rows, 'all');
    expect(lists.live?.id).toBe('live');
    expect(lists.coming.map((r) => r.id)).toEqual(['kyoto', 'vote']);
    expect(lists.past.map((r) => r.id)).toEqual(['lisbon']);
    expect(lists.total).toBe(4);
  });

  it('narrows to trips being planned or trips that are over', () => {
    expect(splitTrips(rows, 'planning')).toMatchObject({ live: null, past: [] });
    expect(splitTrips(rows, 'home').coming).toEqual([]);
  });

  it('names the stage of a trip ahead', () => {
    expect(tripStage(row('a', 'voting', null))).toBe('voting');
    expect(tripStage(row('b', 'confirmed'))).toBe('locked');
    expect(tripStage(row('c', 'setup'))).toBe('planning');
  });
});
