import { describe, expect, it } from 'vitest';

import { windowOptions } from '../../src/setup/no-fit-options';
import {
  fareLookup,
  openDates,
  seasonScorer,
  windowInputFrom,
  type SetupWindowSource,
} from '../../src/setup/window-inputs';

describe('window inputs', () => {
  it('scores a highlight event 100, its edges 85, and months by role', () => {
    const score = seasonScorer(
      [
        { month: 4, role: 'peak' },
        { month: 6, role: 'cheapest' },
      ],
      [
        { kind: 'blossom', starts_on: '2027-04-01', ends_on: '2027-04-07' },
        { kind: 'closure', starts_on: '2027-06-01', ends_on: '2027-06-30' },
      ],
    );
    expect(score('2027-04-03')).toBe(100);
    expect(score('2027-04-09')).toBe(85);
    expect(score('2027-04-20')).toBe(70);
    expect(score('2027-06-10')).toBe(45);
    expect(score('2027-08-10')).toBe(50);
  });

  it('prices a window for the whole crew or not at all', () => {
    const members = [
      { uid: 'a', home: 'SIN', days: {}, askable: [] },
      { uid: 'b', home: 'SGN', days: {}, askable: [] },
      { uid: 'c', home: null, days: {}, askable: [] },
    ];
    const fare = fareLookup(members, [
      {
        origin: 'SIN',
        month: '2027-04-01',
        price_minor: 30_000,
        days: [{ depart_on: '2027-04-02', price_minor: 25_000 }],
      },
      { origin: 'SGN', month: '2027-04-01', price_minor: 20_000, days: [] },
    ]);
    expect(fare?.('2027-04-02')).toBe(45_000n);
    expect(fare?.('2027-04-10')).toBe(50_000n);
    expect(fare?.('2027-05-01')).toBeNull();
  });

  it('knows which dates a place is open, or that it cannot tell', () => {
    const hours = { weekly: { mo: [{ start: '09:00', end: '17:00' }] } };
    expect([...(openDates(hours, '2027-04-05', '2027-04-18') ?? [])]).toEqual([
      '2027-04-05',
      '2027-04-12',
    ]);
    expect(openDates({}, '2027-04-05', '2027-04-18')).toBeNull();
  });

  it('builds the engine input from the database shape', () => {
    const source: SetupWindowSource = {
      members: [
        { uid: 'a', home: null, days: { '2027-04-02': 'free', '2027-04-03': 'free' }, askable: [] },
        {
          uid: 'b',
          home: null,
          days: { '2027-04-02': 'maybe', '2027-04-03': 'free' },
          askable: ['2027-04-02'],
        },
      ],
      months: [],
      events: [],
      fares: [],
      must_dos: [{ id: 'm1', owner_id: 'a', hours: null }],
    };
    const options = windowOptions(
      windowInputFrom(source, { lengthDays: 2, from: '2027-04-01', horizonDays: 183 }),
    );
    expect(options.map((o) => [o.kind, o.askUserId])).toEqual([
      ['partial', null],
      ['ask_first', 'b'],
    ]);
  });
});
