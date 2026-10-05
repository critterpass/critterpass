/**
 * A redraft's minutes saved count what the day screen counts: minutes on the road between stops,
 * from the routed legs where a pair was routed, a walk counting nothing.
 */
import type { DraftDay } from '@cp/domain';
import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { onTheRoad, type RoutedLegs } from '../../../../src/jobs/ai/draft/road-minutes';

const poi = (id: string, lat: number, lng: number): DraftPoi => ({
  id,
  name: id,
  category: 'museum',
  lat,
  lng,
  tz: 'Asia/Ho_Chi_Minh',
  hours: null,
  priceLevel: null,
  tags: [],
  durationMin: 60,
  editorial: true,
  mustSee: false,
});
// A market, a square 400 m away, a lake 2 km on, and a monastery 6 km out.
const pois = new Map(
  [
    poi('market', 11.9425, 108.4375),
    poi('square', 11.9395, 108.4395),
    poi('lake', 11.9385, 108.4565),
    poi('monastery', 11.9035, 108.4395),
  ].map((p) => [p.id, p]),
);
const day = (ids: readonly string[], estimate: number): DraftDay => ({
  day_no: 2,
  date: '2026-10-20',
  theme: 'A day',
  items: ids.map((id, index) => ({
    stable_id: `0199d000-0000-7000-8000-00000000000${index}`,
    kind: 'activity',
    poi_id: id,
    starts_at: '2026-10-20T02:00:00Z',
    ends_at: '2026-10-20T03:00:00Z',
    tz: 'Asia/Ho_Chi_Minh',
    must_do_id: null,
    booking_id: null,
    locked_reason: null,
    cost_model: 'per_person',
    amount_minor: 0,
    currency: 'VND',
    travel_min: index === 0 ? 0 : estimate,
    note: null,
  })),
});
const road = (d: DraftDay) => d.items.reduce((sum, item) => sum + item.travel_min, 0);

describe('minutes on the road', () => {
  it('takes routed legs where the pair was routed, and counts no walk', () => {
    const legs: RoutedLegs = new Map([
      ['square>lake', { mode: 'drive', minutes: 7 }],
      ['market>square', { mode: 'walk', minutes: 9 }],
    ]);
    // Market to square is walked; square to lake routed at 7; lake to monastery estimated at 12.
    expect(road(onTheRoad(day(['market', 'square', 'lake', 'monastery'], 12), legs, pois))).toBe(
      19,
    );
  });

  it('counts a short hop never routed as a walk, and a long one at the estimate', () => {
    expect(road(onTheRoad(day(['market', 'square', 'monastery'], 10), new Map(), pois))).toBe(10);
    // A routed pair counts both ways.
    const back: RoutedLegs = new Map([['monastery>square', { mode: 'drive', minutes: 14 }]]);
    expect(road(onTheRoad(day(['market', 'square', 'monastery'], 10), back, pois))).toBe(14);
  });
});
