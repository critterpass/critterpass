import { describe, expect, it } from '@jest/globals';

import type { DayStopReading } from '@/features/plan';

import {
  dayLead,
  dayOfGo,
  dayRelation,
  dayTimeline,
  withPlanRows,
  type TimelineEntryData,
} from '../day-of-data';
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

describe('the timeline as the day plan reads the day', () => {
  const row = (extra: Partial<DayStopReading>): DayStopReading => ({
    length: '1h',
    legAfter: null,
    personal: null,
    skipping: false,
    moment: null,
    ...extra,
  });
  const reading = (stops: [string, DayStopReading][], mine: TimelineEntryData[] = []) => ({
    stops: new Map(stops),
    mine: mine.map((entry) => ({
      id: entry.id,
      time: entry.time,
      title: entry.title,
      detail: entry.detail ?? '',
      startsAt: entry.startsAt,
      poiId: null,
    })),
  });

  it('reads a note in the reader’s language, falling back to the note as written', () => {
    const rows = [
      {
        id: 'i1',
        stable_id: 'market',
        starts_at: '2026-10-01T07:00:00Z',
        ends_at: null,
        tz: 'Asia/Ho_Chi_Minh',
        attendee_ids: null,
        booking_id: null,
        category: 'market',
        notes: 'Go early for the fabric stalls.',
        status: 'planned',
        poi_id: 'poi-market',
        poi_name: 'Chợ Hàn',
        day_no: 1,
      },
    ];
    const read = (id: string) => (id === 'market' ? 'Đi sớm để xem hàng vải.' : undefined);
    expect(dayTimeline(rows, null, [], 'vi', 'Asia/Ho_Chi_Minh', read)[0]?.detail).toBe(
      'Đi sớm để xem hàng vải.',
    );
    expect(dayTimeline(rows, null, [], 'vi', 'Asia/Ho_Chi_Minh')[0]?.detail).toBe(
      'Go early for the fabric stalls.',
    );
  });

  it('lays lengths, travel and today’s marks on each stop', () => {
    const laid = withPlanRows(
      DAY,
      reading([
        ['Han Market', row({ legAfter: 'Car · 12 min', moment: 'done' })],
        ['Che bo', row({ length: '45 min', moment: 'next' })],
      ]),
    );
    expect(
      laid.map((entry) => [entry.length ?? null, entry.legAfter ?? null, entry.moment]),
    ).toEqual([
      ['1h', 'Car · 12 min', 'done'],
      ['45 min', null, 'next'],
      [null, null, undefined],
    ]);
  });

  it('stands a stop I skip back, says so, and keeps its ticket out of reach', () => {
    const booked = [{ ...stop('14:00', 'Han Market'), bookingId: 'b1' }];
    const [entry] = withPlanRows(
      booked,
      reading([
        ['Han Market', row({ personal: 'You’re skipping this', skipping: true, moment: 'next' })],
      ]),
    );
    expect(entry).toMatchObject({
      dimmed: true,
      detail: 'You’re skipping this',
      bookingId: null,
      moment: null,
    });
  });

  it('puts the stops only I have in their place by time', () => {
    const mine = { ...stop('16:00', 'Cong Ca Phe'), detail: 'Only you' };
    expect(withPlanRows(DAY, reading([], [mine])).map((entry) => entry.title)).toEqual([
      'Han Market',
      'Cong Ca Phe',
      'Che bo',
      'Dragon Bridge',
    ]);
  });
});
