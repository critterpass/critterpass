import { describe, expect, it } from '@jest/globals';

import { toSetupTrip } from '../setup-trip';

const trip = (guide_slug: string | null) => ({
  crew_id: 'crew',
  status: 'setup',
  setup_step: 'when',
  destination_name: 'Đà Nẵng',
  guide_slug,
  start_date: null,
  end_date: null,
  tz: 'Asia/Ho_Chi_Minh',
  trip_length_days: null,
  local_currency: 'VND',
  seat_cap: null,
  is_solo: 0,
});

describe('toSetupTrip guide', () => {
  it('keeps a guide outside the six-tile first-run grid, such as Chà Vá', () => {
    expect(toSetupTrip('trip', 'me', trip('chava'), [], []).guide).toBe('chava');
  });

  it('falls back to Tokek for no guide or an unknown slug', () => {
    expect(toSetupTrip('trip', 'me', trip(null), [], []).guide).toBe('tokek');
    expect(toSetupTrip('trip', 'me', trip('nobody'), [], []).guide).toBe('tokek');
  });
});
