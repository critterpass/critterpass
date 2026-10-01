import { describe, expect, it } from '@jest/globals';

import { dayLead, dayRelation, type TimelineEntryData } from '../day-of-data';

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
});
