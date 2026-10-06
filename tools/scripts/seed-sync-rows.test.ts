import { describe, expect, it } from 'vitest';

import { applySyncLine, type SyncedRow } from './seed-sync-rows';
import { leaveByFor } from './seed-trip-day';

const put = (table: string, id: string, data: unknown) =>
  JSON.stringify({ data: { data: [{ op: 'PUT', object_type: table, object_id: id, data }] } });

describe('applySyncLine', () => {
  it('keeps the rows of one table, drops removed ones and reports the first full checkpoint', () => {
    const rows = new Map<string, SyncedRow>();
    expect(applySyncLine(put('leave_bys', 'a', '{"trip_id":"t"}'), 'leave_bys', rows)).toBe(false);
    expect(applySyncLine(put('trips', 'b', { status: 'in_trip' }), 'leave_bys', rows)).toBe(false);
    expect([...rows.values()]).toEqual([{ id: 'a', trip_id: 't' }]);
    const removed = JSON.stringify({
      data: { data: [{ op: 'REMOVE', object_type: 'leave_bys', object_id: 'a' }] },
    });
    expect(applySyncLine(removed, 'leave_bys', rows)).toBe(false);
    expect(rows.size).toBe(0);
    expect(applySyncLine('{"checkpoint_complete":{"last_op_id":"1"}}', 'leave_bys', rows)).toBe(
      true,
    );
  });
});

describe('leaveByFor', () => {
  const row = (id: string, localDate: string, leaveAt: string): SyncedRow => ({
    id,
    local_date: localDate,
    leave_at: leaveAt,
    tz: 'Asia/Ho_Chi_Minh',
  });
  const days = [
    row('day-2', '2026-10-08', '2026-10-08T01:00:00Z'),
    row('day-1', '2026-10-07', '2026-10-07T06:00:00Z'),
  ];

  it("picks today's in the trip's own zone, even once its time has passed", () => {
    // 18:30 UTC on the 6th is already the 7th in Đà Nẵng.
    expect(leaveByFor(days, new Date('2026-10-06T18:30:00Z'))?.id).toBe('day-1');
    expect(leaveByFor(days, new Date('2026-10-07T09:00:00Z'))?.id).toBe('day-1');
  });

  it('falls back to the next one, then the last', () => {
    expect(leaveByFor(days, new Date('2026-10-05T09:00:00Z'))?.id).toBe('day-1');
    expect(leaveByFor(days, new Date('2026-10-09T09:00:00Z'))?.id).toBe('day-2');
    expect(leaveByFor([], new Date())).toBeUndefined();
  });
});
