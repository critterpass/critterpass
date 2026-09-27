import { Temporal } from '@js-temporal/polyfill';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { localSchedule, resolveLocalSchedule, toLocalWallTime } from '../src/time/local-schedule';

const ZONES = [
  'Asia/Saigon',
  'Asia/Ho_Chi_Minh',
  'Asia/Singapore',
  'Asia/Kathmandu',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Australia/Lord_Howe',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'UTC',
] as const;

const pad = (value: number) => String(value).padStart(2, '0');

interface WallInput {
  readonly date: string;
  readonly time: string;
  readonly tz: string;
}

function inputFromWall(wall: Temporal.PlainDateTime, tz: string): WallInput {
  return { date: wall.toPlainDate().toString(), time: `${pad(wall.hour)}:${pad(wall.minute)}`, tz };
}

/** Any wall time between 2020 and 2035 at minute precision, in any zone of the list. */
const anyWallTime = fc
  .record({
    day: fc.integer({ min: 0, max: 16 * 366 }),
    minute: fc.integer({ min: 0, max: 24 * 60 - 1 }),
    tz: fc.constantFrom(...ZONES),
  })
  .map(({ day, minute, tz }) =>
    inputFromWall(
      Temporal.PlainDateTime.from('2020-01-01T00:00').add({ days: day, minutes: minute }),
      tz,
    ),
  );

/**
 * Wall times within two hours of one of the year's offset transitions, so gaps and overlaps are
 * hit on most runs instead of by luck. Zones without transitions fall back to midnight.
 */
const nearTransition = fc
  .record({
    year: fc.integer({ min: 2020, max: 2035 }),
    which: fc.integer({ min: 0, max: 1 }),
    offset: fc.integer({ min: -120, max: 120 }),
    tz: fc.constantFrom(...ZONES),
  })
  .map(({ year, which, offset, tz }) => {
    const start = Temporal.PlainDateTime.from(`${year}-01-01T00:00`).toZonedDateTime(tz);
    let transition = start.getTimeZoneTransition('next');
    if (which === 1 && transition !== null) {
      transition = transition.getTimeZoneTransition('next');
    }
    const around = (transition ?? start).toPlainDateTime().add({ minutes: offset });
    return inputFromWall(around, tz);
  });

const wallTimes = fc.oneof(anyWallTime, nearTransition);

function wallOf(at: Date, tz: string): Temporal.PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(at.getTime())
    .toZonedDateTimeISO(tz)
    .toPlainDateTime();
}

describe('localSchedule', () => {
  it('fires at the exact wall time whenever that time exists', () => {
    fc.assert(
      fc.property(wallTimes, (sample) => {
        const input = sample;
        const { at, resolution } = resolveLocalSchedule(input);
        const wall = Temporal.PlainDateTime.from(`${input.date}T${input.time}`);
        if (resolution === 'gap') return;
        expect(Temporal.PlainDateTime.compare(wallOf(at, input.tz), wall)).toBe(0);
      }),
      { numRuns: 5000 },
    );
  });

  it('moves a skipped wall time to the first valid minute after the gap', () => {
    fc.assert(
      fc.property(wallTimes, (sample) => {
        const input = sample;
        const { at, resolution } = resolveLocalSchedule(input);
        if (resolution !== 'gap') return;
        const wall = Temporal.PlainDateTime.from(`${input.date}T${input.time}`);
        // The fire time is after the requested wall time, and one minute earlier is before it.
        expect(Temporal.PlainDateTime.compare(wallOf(at, input.tz), wall)).toBe(1);
        const minuteBefore = new Date(at.getTime() - 60_000);
        expect(Temporal.PlainDateTime.compare(wallOf(minuteBefore, input.tz), wall)).toBe(-1);
      }),
      { numRuns: 5000 },
    );
  });

  it('takes the first of two occurrences in an overlap', () => {
    fc.assert(
      fc.property(wallTimes, (sample) => {
        const input = sample;
        const { at, resolution } = resolveLocalSchedule(input);
        if (resolution !== 'overlap') return;
        const wall = Temporal.PlainDateTime.from(`${input.date}T${input.time}`);
        const later = wall.toZonedDateTime(input.tz, { disambiguation: 'later' });
        expect(at.getTime()).toBeLessThan(later.epochMilliseconds);
      }),
      { numRuns: 5000 },
    );
  });

  it('is monotonic: a later wall time never fires earlier', () => {
    fc.assert(
      fc.property(wallTimes, fc.integer({ min: 1, max: 600 }), (sample, step) => {
        const wall = Temporal.PlainDateTime.from(`${sample.date}T${sample.time}`);
        const first = localSchedule(sample);
        const second = localSchedule(inputFromWall(wall.add({ minutes: step }), sample.tz));
        expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
      }),
      { numRuns: 3000 },
    );
  });

  it('hits gaps and overlaps in the generated samples', () => {
    const seen = new Set(
      fc.sample(nearTransition, 400).map((sample) => resolveLocalSchedule(sample).resolution),
    );
    expect(seen).toEqual(new Set(['exact', 'gap', 'overlap']));
  });

  it('maps Asia/Saigon (no DST, UTC+7) directly', () => {
    expect(localSchedule({ date: '2026-09-27', time: '20:00', tz: 'Asia/Saigon' })).toEqual(
      new Date('2026-09-27T13:00:00Z'),
    );
    expect(localSchedule({ date: '2027-01-01', time: '00:00', tz: 'Asia/Saigon' })).toEqual(
      new Date('2026-12-31T17:00:00Z'),
    );
  });

  it('handles Europe/Berlin spring-forward and fall-back', () => {
    // 29 Mar 2026: 02:00 CET jumps to 03:00 CEST (01:00Z).
    expect(
      resolveLocalSchedule({ date: '2026-03-29', time: '02:30', tz: 'Europe/Berlin' }),
    ).toEqual({ at: new Date('2026-03-29T01:00:00Z'), resolution: 'gap' });
    expect(localSchedule({ date: '2026-03-29', time: '03:00', tz: 'Europe/Berlin' })).toEqual(
      new Date('2026-03-29T01:00:00Z'),
    );
    expect(localSchedule({ date: '2026-03-29', time: '01:59', tz: 'Europe/Berlin' })).toEqual(
      new Date('2026-03-29T00:59:00Z'),
    );
    // 25 Oct 2026: 03:00 CEST falls back to 02:00 CET; 02:30 happens at 00:30Z and at 01:30Z.
    expect(
      resolveLocalSchedule({ date: '2026-10-25', time: '02:30', tz: 'Europe/Berlin' }),
    ).toEqual({ at: new Date('2026-10-25T00:30:00Z'), resolution: 'overlap' });
  });

  it('handles a 30-minute DST shift (Australia/Lord_Howe) and a non-hour offset', () => {
    // 4 Oct 2026: 02:00 LHST (+10:30) jumps to 02:30 LHDT (+11:00).
    expect(
      resolveLocalSchedule({ date: '2026-10-04', time: '02:10', tz: 'Australia/Lord_Howe' }),
    ).toEqual({ at: new Date('2026-10-03T15:30:00Z'), resolution: 'gap' });
    expect(localSchedule({ date: '2026-09-27', time: '08:00', tz: 'Asia/Kathmandu' })).toEqual(
      new Date('2026-09-27T02:15:00Z'),
    );
  });

  it('round-trips through toLocalWallTime', () => {
    const at = localSchedule({ date: '2026-07-01', time: '20:00', tz: 'Europe/Berlin' });
    expect(toLocalWallTime(at, 'Europe/Berlin')).toEqual({ date: '2026-07-01', time: '20:00:00' });
  });

  it('rejects impossible dates and times', () => {
    expect(() => localSchedule({ date: '2026-02-30', time: '10:00', tz: 'UTC' })).toThrow();
    expect(() => localSchedule({ date: '2026-02-01', time: '24:30', tz: 'UTC' })).toThrow();
    expect(() => localSchedule({ date: '2026-02-01', time: '10:00', tz: 'Mars/Base' })).toThrow();
  });
});
