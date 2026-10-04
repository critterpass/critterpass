import { describe, expect, it } from '@jest/globals';

import { dayLead, dayOfGo, dayRelation, type TimelineEntryData } from '../day-of-data';
import { baturLeaveBy } from '../dev/bali-day';

function stop(time: string, title: string): TimelineEntryData {
  return {
    id: title,
    time,
    title,
    detail: null,
    dimmed: false,
    bookingId: null,
    startsAt: new Date(`2026-10-01T${time}:00+07:00`),
  };
}

const DAY = [stop('14:00', 'Han Market'), stop('18:00', 'Che bo'), stop('20:30', 'Dragon Bridge')];
const at = (time: string) => new Date(`2026-10-01T${time}:00+07:00`);

describe('what leads the day-of screen', () => {
  it('leads today with the stop still ahead, and says the day is done after the last one', () => {
    expect(dayLead(DAY, true, at('09:00'))).toEqual({
      kind: 'first',
      time: '14:00',
      title: 'Han Market',
    });
    expect(dayLead(DAY, true, at('17:45'))).toEqual({
      kind: 'next',
      time: '18:00',
      title: 'Che bo',
    });
    expect(dayLead(DAY, true, at('21:00'))).toEqual({ kind: 'done' });
  });

  it('leads another day with its first stop whatever the hour, and a day with no stops is free', () => {
    expect(dayLead(DAY, false, at('21:00'))).toEqual({
      kind: 'first',
      time: '14:00',
      title: 'Han Market',
    });
    expect(dayLead([], true, at('09:00'))).toBeNull();
  });

  it('knows tomorrow from today across a month end', () => {
    expect(dayRelation('2026-10-01', '2026-10-01')).toBe('today');
    expect(dayRelation('2026-11-01', '2026-10-31')).toBe('tomorrow');
    expect(dayRelation('2026-10-03', '2026-10-01')).toBe('other');
  });

  it("offers GO to the leave-by first, then to today's next stop with a place", () => {
    const TRIP = 'trip-1';
    const leaveBy = baturLeaveBy();
    const withPlace = [{ ...stop('18:00', 'Che bo'), poiId: 'poi-che' }];
    const lead = dayLead(withPlace, true, at('15:00'));
    expect(dayOfGo(leaveBy, lead, TRIP, true)).toEqual({
      leaveBy: { kind: 'leave_by', leaveById: leaveBy.id },
      stop: { kind: 'place', poiId: 'poi-che', tripId: TRIP },
    });
    expect(dayOfGo(null, dayLead(DAY, true, at('15:00')), TRIP, true)).toEqual({
      leaveBy: null,
      stop: null,
    });
    expect(dayOfGo(null, dayLead(withPlace, true, at('21:00')), TRIP, true).stop).toBeNull();
    expect(dayOfGo(leaveBy, lead, TRIP, false)).toEqual({ leaveBy: null, stop: null });
  });
});
