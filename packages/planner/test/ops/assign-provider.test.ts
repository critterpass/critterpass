import { describe, expect, it } from 'vitest';

import { assignProviderPayload, pickDays, type PickableDay } from '../../src/ops/assign-provider';

const days: PickableDay[] = [
  {
    date: '2026-10-14',
    window: { start: '06:30', end: '18:00' },
    pickup: 'Villa',
    assignedProviderId: null,
  },
  {
    date: '2026-10-15',
    window: { start: '03:30', end: '11:00' },
    pickup: null,
    assignedProviderId: 'ketut',
  },
  {
    date: '2026-10-18',
    window: { start: '13:00', end: '21:30' },
    pickup: null,
    assignedProviderId: 'made',
  },
  { date: '2026-10-19', window: null, pickup: null, assignedProviderId: null },
];

describe('pick a driver for days', () => {
  it("locks days set on another driver and warns where a day outruns the price's hours", () => {
    const picked = pickDays(days, 'made', 10);
    expect(picked.map((day) => [day.date, day.taken, day.hours, day.overHours])).toEqual([
      ['2026-10-14', false, 11.5, true],
      ['2026-10-15', true, 7.5, false],
      ['2026-10-18', false, 8.5, false],
      ['2026-10-19', false, null, false],
    ]);
  });

  it('never sends a TAKEN day, and nothing when no free day is picked', () => {
    const picked = pickDays(days, 'made', 10);
    const payload = assignProviderPayload(
      'trip',
      'made',
      picked,
      new Set(['2026-10-14', '2026-10-15']),
    );
    expect(payload?.days).toEqual([
      { date: '2026-10-14', window_start: '06:30', window_end: '18:00', pickup: 'Villa' },
    ]);
    expect(assignProviderPayload('trip', 'made', picked, new Set(['2026-10-15']))).toBeNull();
  });
});
