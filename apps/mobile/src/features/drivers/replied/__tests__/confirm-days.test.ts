import { describe, expect, it } from '@jest/globals';

import { confirmLines, driverConfirmOf, type VotedAssignment } from '../confirm-days';

const MADE = '00000000-0000-4000-8000-000000000001';
const KETUT = '00000000-0000-4000-8000-000000000002';
const VOTE = '00000000-0000-4000-8000-0000000000aa';

const row = (date: string, extra: Partial<VotedAssignment> = {}): VotedAssignment => ({
  day_date: date,
  provider_id: MADE,
  window_start: '06:30',
  window_end: '18:00',
  agreed: JSON.stringify({ price_minor: 70000000, currency: 'IDR' }),
  change_set_id: VOTE,
  ...extra,
});

const PLAN = [
  {
    date: '2026-10-14',
    stops: [
      { lat: -8.3702, lng: 115.1313 },
      { lat: -8.5, lng: 115.2 },
    ],
  },
  { date: '2026-10-18', stops: [] },
];

describe('what the driver is told once the vote set him', () => {
  it('offers nothing before a vote set him: not for a day set by hand, nor for another driver', () => {
    expect(driverConfirmOf([], MADE, PLAN)).toBeNull();
    expect(
      driverConfirmOf(
        [row('2026-10-14', { change_set_id: null }), row('2026-10-15', { provider_id: KETUT })],
        MADE,
        PLAN,
      ),
    ).toBeNull();
  });

  it('lists only his voted days in date order, with the window, the first pickup pin and the price', () => {
    const confirm = driverConfirmOf(
      [
        row('2026-10-18', { window_start: null, window_end: null }),
        row('2026-10-15', { provider_id: KETUT }),
        row('2026-10-16', { change_set_id: null }),
        row('2026-10-14'),
      ],
      MADE,
      PLAN,
    );
    expect(confirm?.price).toEqual({ minor: 70000000, currency: 'IDR' });
    expect(confirmLines(confirm!, (date) => date.slice(8))).toBe(
      '14 · 06:30–18:00 · https://www.google.com/maps/search/?api=1&query=-8.370200,115.131300\n18',
    );
  });

  it('leaves the price out when the agreed terms name none', () => {
    for (const agreed of [
      null,
      'not json',
      JSON.stringify({ price_minor: null, currency: null }),
    ]) {
      expect(driverConfirmOf([row('2026-10-14', { agreed })], MADE, PLAN)?.price).toBeNull();
    }
  });
});
