/** Starting a stop early because she is already there brings the day forward up to a fixed stop. */
import { describe, expect, it } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import { startFromNow } from '../start-now';

const SLOT = { dayNo: 1, date: '2026-10-05' };
const stop = (stableId: string, start: number, end: number, extra: Partial<DayItem> = {}) => ({
  stableId,
  dayNo: 1,
  title: stableId,
  category: null,
  start,
  end,
  tz: 'Asia/Ho_Chi_Minh',
  lane: null,
  attendeeIds: [],
  lock: null,
  status: 'confirmed',
  byGuide: false,
  notes: null,
  poiId: null,
  place: null,
  amountMinor: null,
  currency: null,
  costModel: null,
  bookingId: null,
  ...extra,
});

const MARBLE = stop('marble', 14 * 60, 15 * 60 + 30);
const MUSEUM = stop('museum', 16 * 60 + 15, 17 * 60 + 45);
const BRIDGE = stop('bridge', 18 * 60 + 15, 18 * 60 + 45);

describe('start from now', () => {
  it('starts the stop now and brings the rest of the day forward by as much', () => {
    // 13:01: the stop starts 13:05, 55 minutes early.
    const plan = startFromNow({
      stops: [MARBLE, MUSEUM, BRIDGE],
      stop: MARBLE,
      nowMinutes: 13 * 60 + 1,
      slot: SLOT,
    });
    expect(plan).toMatchObject({ start: 13 * 60 + 5, by: 55, moved: 2 });
    expect(plan?.ops).toHaveLength(3);
  });

  it('stops at a stop that keeps its time', () => {
    const booked = { ...MUSEUM, lock: 'booking' as const };
    const plan = startFromNow({
      stops: [MARBLE, booked, BRIDGE],
      stop: MARBLE,
      nowMinutes: 13 * 60,
      slot: SLOT,
    });
    expect(plan).toMatchObject({ moved: 0 });
    expect(JSON.stringify(plan?.ops)).not.toContain('bridge');
  });

  it('is not offered a few minutes early, or for a stop that keeps its time', () => {
    expect(
      startFromNow({ stops: [MARBLE], stop: MARBLE, nowMinutes: 13 * 60 + 50, slot: SLOT }),
    ).toBeNull();
    const pinned = { ...MARBLE, lock: 'user' as const };
    expect(
      startFromNow({ stops: [pinned], stop: pinned, nowMinutes: 12 * 60, slot: SLOT }),
    ).toBeNull();
  });
});
