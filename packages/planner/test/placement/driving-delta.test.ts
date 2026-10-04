/**
 * The review's driving chip: adding a far stop between two near ones adds the drive there and back,
 * a dropped change counts nothing, a removed stop takes its drive away, walking legs don't count,
 * and stored legs win over straight lines.
 */
import type { ChangeSetOp } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { drivingDeltaMinutes, type DriveStop } from '../../src/placement/index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VILLA = { lat: -8.5069, lng: 115.2625 };
const NEAR = { lat: -8.5075, lng: 115.2635 };
const FAR = { lat: -8.4153, lng: 115.3153 };

const STOPS: DriveStop[] = [
  { stableId: id(1), dayNo: 2, startsAt: '2026-10-14T01:00:00Z', point: VILLA },
  { stableId: id(2), dayNo: 2, startsAt: '2026-10-14T06:00:00Z', point: NEAR },
];

const add = (
  n: number,
  poi: string,
  at: string,
  extra: Partial<ChangeSetOp> = {},
): ChangeSetOp => ({
  op: 'add',
  target: id(n),
  after: { day_no: 2, starts_at: at, poi_id: poi },
  reason: 'ideas_placed',
  affected_user_ids: [],
  booking_impact: false,
  ...extra,
});

const base = {
  driveFactor: 1.3,
  walkMaxM: 1200,
  legs: new Map(),
  points: new Map([[id(50), FAR]]),
};

describe('drivingDeltaMinutes', () => {
  it('adds the drive to a far stop and back', () => {
    const delta = drivingDeltaMinutes({
      ...base,
      items: STOPS,
      ops: [add(3, id(50), '2026-10-14T03:00:00Z')],
    });
    expect(delta).toBeGreaterThan(20);
  });

  it('counts nothing for a dropped change and takes away a removed stop’s drive', () => {
    expect(
      drivingDeltaMinutes({
        ...base,
        items: STOPS,
        ops: [add(3, id(50), '2026-10-14T03:00:00Z', { accepted: false })],
      }),
    ).toBe(0);
    const far: DriveStop[] = [
      ...STOPS,
      { stableId: id(4), dayNo: 2, startsAt: '2026-10-14T08:00:00Z', point: FAR },
    ];
    const removed = drivingDeltaMinutes({
      ...base,
      items: far,
      ops: [
        { op: 'remove', target: id(4), reason: 'x', affected_user_ids: [], booking_impact: false },
      ],
    });
    expect(removed).toBeLessThan(0);
  });

  it('reads stored legs before straight lines and leaves walking out', () => {
    const legs = new Map([
      [`${id(1)}>${id(3)}`, { minutes: 50, mode: 'drive' as const, approx: false }],
      [`${id(3)}>${id(2)}`, { minutes: 5, mode: 'walk' as const, approx: false }],
    ]);
    const delta = drivingDeltaMinutes({
      ...base,
      legs,
      items: STOPS,
      ops: [add(3, id(50), '2026-10-14T03:00:00Z')],
    });
    expect(delta).toBe(50);
  });
});
