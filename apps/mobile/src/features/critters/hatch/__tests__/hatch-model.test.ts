import { describe, expect, it } from '@jest/globals';

import type { TripRow } from '../../data/queries';
import { canHatchByHand, eggCardFor } from '../hatch-model';

const TZ = 'Asia/Ho_Chi_Minh';

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: 'trip',
    crew_id: 'crew',
    status: 'in_trip',
    start_date: '2026-10-02',
    end_date: '2026-10-04',
    tz: TZ,
    destination_id: 'dad',
    destination_name: 'Đà Nẵng',
    destination_country: 'VN',
    colour: null,
    critter_set_id: 'vn',
    guide_slug: 'chava',
    guide_name: 'Chà Vá',
    guide_id: 'g',
    landed_at: null,
    rsvp: 'in',
    egg_id: 'egg',
    egg_form_id: 'form',
    egg_hatched_at: null,
    egg_trigger: null,
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);
const never = () => false;

describe('the trip egg', () => {
  it('can be hatched by hand only once the trip is under way and it is the start date here', () => {
    expect(canHatchByHand(trip(), at('2026-10-01T16:59:00Z'), TZ)).toBe(false);
    expect(canHatchByHand(trip(), at('2026-10-01T17:00:00Z'), TZ)).toBe(true);
    expect(canHatchByHand(trip({ status: 'pre_trip' }), at('2026-10-03T00:00:00Z'), TZ)).toBe(
      false,
    );
  });

  it('waits before the trip, is ready during it, and asks to be met once hatched elsewhere', () => {
    const before = at('2026-09-30T00:00:00Z');
    const during = at('2026-10-02T03:00:00Z');
    expect(eggCardFor([trip({ status: 'pre_trip' })], before, never, TZ)?.kind).toBe('waiting');
    expect(eggCardFor([trip()], during, never, TZ)?.kind).toBe('ready');
    const hatched = trip({ egg_hatched_at: '2026-10-02T02:00:00Z' });
    expect(eggCardFor([hatched], during, never, TZ)?.kind).toBe('unseen');
    expect(eggCardFor([hatched], during, (id) => id === 'egg', TZ)).toBeNull();
  });

  it('has no card without an egg (a dropout, or before boarding)', () => {
    expect(eggCardFor([trip({ egg_id: null })], at('2026-10-02T03:00:00Z'), never, TZ)).toBeNull();
  });
});
