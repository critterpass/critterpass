import { describe, expect, it } from '@jest/globals';

import { buildLeaveBy, deadlineOf, type LeaveByRow } from '../model';

function row(extra: Partial<LeaveByRow>): LeaveByRow {
  return {
    id: 'lb-1',
    trip_id: 't-1',
    plan_item_id: 'i-1',
    title: '9G 956 SGN → DAD',
    place_name: 'Tan Son Nhat',
    local_date: '2026-10-02',
    starts_at: '2026-10-02T00:05:00Z',
    leave_at: '2026-10-01T21:55:00Z',
    pickup_at: null,
    tz: 'Asia/Ho_Chi_Minh',
    legs: null,
    alarm_policy: null,
    pickup: null,
    buffer_min: 10,
    guide_note: null,
    participant_ids: '["me"]',
    state: 'scheduled',
    ...extra,
  };
}

const view = (extra: Partial<LeaveByRow>) =>
  buildLeaveBy({
    row: row(extra),
    readiness: [],
    members: [{ id: 'me', name: 'Winston', joinIndex: 0 }],
    me: 'me',
    now: new Date('2026-10-01T20:00:00Z'),
  });

describe('what a leave-by asks', () => {
  it('is when to leave once travel is worked out, with or without live traffic', () => {
    const routed = view({
      leave_at: '2026-10-01T21:15:00Z',
      legs: JSON.stringify([{ kind: 'route', minutes: 40, traffic: true }]),
    });
    expect(routed.deadline).toEqual({ kind: 'leave_by', at: new Date('2026-10-01T21:15:00Z') });
    expect(routed.withoutTraffic).toBe(false);
    const estimated = view({
      leave_at: '2026-10-01T21:15:00Z',
      legs: JSON.stringify([{ kind: 'route', minutes: 40, traffic: false }]),
    });
    expect(estimated.deadline.kind).toBe('leave_by');
    expect(estimated.withoutTraffic).toBe(true);
  });

  it('is when to be at the airport for a flight with no travel leg: two hours before it leaves', () => {
    const flight = view({ legs: JSON.stringify([{ kind: 'none' }]) });
    // Stored as 04:55 (07:05 less two hours, less the ten-minute buffer); the traveller reads 05:05.
    expect(flight.leaveAt).toEqual(new Date('2026-10-01T21:55:00Z'));
    expect(flight.deadline).toEqual({
      kind: 'be_there_by',
      at: new Date('2026-10-01T22:05:00Z'),
      airport: true,
    });
  });

  it('is the start of an early stop, or its pickup, when there is no travel leg', () => {
    const sunrise = row({
      starts_at: '2026-10-02T22:30:00Z',
      leave_at: '2026-10-02T22:20:00Z',
      legs: JSON.stringify([{ kind: 'none' }]),
    });
    expect(deadlineOf(sunrise)).toEqual({
      kind: 'be_there_by',
      at: new Date('2026-10-02T22:30:00Z'),
      airport: false,
    });
    expect(deadlineOf({ ...sunrise, pickup_at: '2026-10-02T22:10:00Z' })).toEqual({
      kind: 'be_there_by',
      at: new Date('2026-10-02T22:10:00Z'),
      airport: false,
    });
  });
});
