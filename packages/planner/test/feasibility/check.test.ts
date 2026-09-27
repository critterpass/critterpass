import { describe, expect, it } from 'vitest';

import { checkFeasibility } from '../../src/feasibility/check';
import { VIOLATION_CODES, type FeasibilityInput } from '../../src/feasibility/types';
import { CREW, GOOD_DAY, GOOD_TRAVEL, MUSEUM_HOURS, at, item, matrix } from './fixtures';

const base: FeasibilityInput = {
  items: GOOD_DAY,
  members: CREW,
  travel: GOOD_TRAVEL,
  mustDos: [{ id: 'md-inari', ownerId: 'u-rin' }],
  bookings: [{ bookingId: 'bk-dinner', startsAt: at(6, '19:00'), endsAt: at(6, '21:00') }],
};

const codes = (input: FeasibilityInput) => checkFeasibility(input).violations.map((v) => v.code);

describe('checkFeasibility', () => {
  it('a well-spaced day fits', () => {
    expect(checkFeasibility(base)).toEqual({ status: 'fits', violations: [], tight: [] });
  });

  it('CLOSED_AT_TIME: the museum on a Monday, or running past closing', () => {
    const monday = GOOD_DAY.map((i) =>
      i.stableId === 'museum' ? item('museum', 5, '13:00', '15:00', { hours: MUSEUM_HOURS }) : i,
    );
    expect(codes({ ...base, items: monday })).toContain('CLOSED_AT_TIME');
    const late = GOOD_DAY.map((i) =>
      i.stableId === 'museum' ? { ...i, endsAt: at(6, '17:30') } : i,
    );
    expect(checkFeasibility({ ...base, items: late }).violations).toContainEqual({
      code: 'CLOSED_AT_TIME',
      stableId: 'museum',
    });
  });

  it('TRAVEL_TOO_LONG: a 45-minute ride into a 30-minute gap, once for everyone on the leg', () => {
    const result = checkFeasibility({ ...base, travel: matrix({ 'market>museum': 150 }) });
    expect(result.status).toBe('clash');
    expect(result.violations).toEqual([
      { code: 'TRAVEL_TOO_LONG', stableId: 'museum', relatedId: 'market', uids: CREW, minutes: 30 },
    ]);
  });

  it('OVERLAP: two items at once for the same person', () => {
    const items = [...GOOD_DAY, item('tea', 6, '10:30', '11:30', { attendeeIds: ['u-maya'] })];
    expect(checkFeasibility({ ...base, items }).violations).toContainEqual({
      code: 'OVERLAP',
      stableId: 'tea',
      relatedId: 'market',
      uids: ['u-maya'],
      minutes: 30,
    });
  });

  it('CHRONOTYPE: a night owl at sunrise, an early bird past 22:00 — tight, not clash', () => {
    const result = checkFeasibility({
      ...base,
      items: GOOD_DAY.map((i) =>
        i.stableId === 'dinner' ? { ...i, endsAt: at(6, '22:30'), bookingId: null } : i,
      ),
      chronotypes: { 'u-winston': 'night_owl', 'u-alex': 'early_bird' },
    });
    expect(result.violations).toEqual([
      { code: 'CHRONOTYPE', stableId: 'dinner', uids: ['u-alex'] },
      { code: 'CHRONOTYPE', stableId: 'inari', uids: ['u-winston'] },
    ]);
    expect(result.status).toBe('tight');
  });

  it('MUST_DO_MISSING: a must-do with no item', () => {
    const items = GOOD_DAY.filter((i) => i.stableId !== 'inari');
    expect(checkFeasibility({ ...base, items }).violations).toEqual([
      { code: 'MUST_DO_MISSING', stableId: null, mustDoId: 'md-inari', uids: ['u-rin'] },
    ]);
  });

  it('BOOKING_MOVED: the booked dinner is no longer at its booked time', () => {
    const items = GOOD_DAY.map((i) =>
      i.stableId === 'dinner' ? { ...i, startsAt: at(6, '19:30'), endsAt: at(6, '21:30') } : i,
    );
    expect(codes({ ...base, items })).toEqual(['BOOKING_MOVED']);
  });

  it('OFF_GRID: 09:37 is not on the 15-minute grid', () => {
    const items = GOOD_DAY.map((i) =>
      i.stableId === 'market' ? { ...i, startsAt: at(6, '09:37') } : i,
    );
    expect(codes({ ...base, items })).toEqual(['OFF_GRID']);
  });

  it('OFF_GRID uses local time: 10:00 in Kathmandu (+05:45) is on the grid', () => {
    const kathmandu = {
      ...GOOD_DAY[1]!,
      tz: 'Asia/Kathmandu',
      startsAt: new Date('2027-04-06T10:00:00+05:45'),
      endsAt: new Date('2027-04-06T11:00:00+05:45'),
      hours: null,
    };
    expect(codes({ ...base, items: [kathmandu], mustDos: [], bookings: [] })).toEqual([]);
  });

  it('thin slack between items is tight', () => {
    const result = checkFeasibility({ ...base, travel: matrix({ 'inari>market': 80 }) });
    expect(result).toMatchObject({ status: 'tight', tight: ['market'] });
  });

  it('covers every violation code', () => {
    const everything: FeasibilityInput = {
      ...base,
      items: [
        item('a', 5, '06:07', '08:00', { hours: MUSEUM_HOURS, bookingId: 'bk-dinner' }),
        item('b', 5, '07:30', '09:00'),
        item('c', 5, '09:15', '10:00'),
      ],
      travel: matrix({ 'b>c': 60 }),
      chronotypes: { 'u-maya': 'night_owl' },
    };
    expect([...new Set(codes(everything))].sort()).toEqual([...VIOLATION_CODES].sort());
  });
});
