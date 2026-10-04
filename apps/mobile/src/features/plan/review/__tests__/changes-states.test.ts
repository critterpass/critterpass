/**
 * What the review may say about a change set: it only fits when the plan with the changes in
 * holds (a changed stop that overlaps another, or leaves too little time to get there, is named;
 * a clash the plan already had is not blamed on the set, nor is an unticked change); the guide's
 * reason keys are worded and a person's own words kept; and the vote line carries my answer, the
 * tally and when it closes.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { PlanItem } from '../../overview/model/plan-model';
import { changeReason } from '../changes-copy';
import { closesLine, summaryLine, voteLine } from '../changes-state-copy';
import { collisionsAfter } from '../model/after-fit';
import { opsOf } from '../model/changes-ops';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CREW = [id(91), id(92)];
const TZ = 'Asia/Ho_Chi_Minh';
const at = (time: string) => `2026-10-21T${time}:00+07:00`;

const stop = (n: number, from: string, to: string, lat: number, lng: number): PlanItem => ({
  stableId: id(n),
  dayNo: 3,
  startsAt: at(from),
  endsAt: at(to),
  tz: TZ,
  label: `Stop ${String(n)}`,
  category: 'food',
  poiId: null,
  bookingId: null,
  mustDoId: null,
  lockedReason: null,
  status: null,
  byGuide: false,
  attendeeIds: [],
  lat,
  lng,
  amountMinor: null,
  currency: null,
  costModel: null,
});

// Lunch in town at 10:00, coffee next door at 12:00.
const BASE = [stop(1, '10:00', '11:00', 16.06, 108.22), stop(2, '12:00', '13:00', 16.061, 108.221)];

const add = (from: string, to: string, lat: number, lng: number, accepted = true) =>
  opsOf(
    JSON.stringify([
      {
        op: 'add',
        target: id(3),
        after: {
          day_no: 3,
          starts_at: at(from),
          ends_at: at(to),
          custom_place: { name: 'Hill station', lat, lng },
        },
        reason: 'Added to the day',
        affected_user_ids: [],
        booking_impact: false,
      },
    ]),
    new Map([[id(3), accepted]]),
  );

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('whether a change set leaves a plan that holds', () => {
  it('names the stop an added place would run into', () => {
    const found = collisionsAfter(BASE, add('07:00', '11:00', 16.06, 108.22), CREW, TZ);
    expect(found).toEqual([{ stableId: id(3), withId: id(1), kind: 'overlap', minutes: 60 }]);
    expect(
      summaryLine({
        author: 'Minh',
        collision: found[0] ?? null,
        stopName: (stableId) => (stableId === id(3) ? 'Hill station' : 'Lunch'),
        calm: true,
        ideas: false,
      }),
    ).toBe(
      'Minh suggested this. Hill station would run into Lunch. Untick it, or move one of them on the day first.',
    );
  });

  it('names a place too far to reach in the time left before the next stop', () => {
    // An hour's drive out of town, ending ten minutes before lunch.
    const found = collisionsAfter(BASE, add('07:00', '09:50', 15.99, 107.99), CREW, TZ);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ stableId: id(3), withId: id(1), kind: 'travel' });
    expect(found[0]?.minutes).toBeGreaterThan(0);
  });

  it('says nothing when the place fits, when it is unticked, or for a clash the plan already had', () => {
    expect(collisionsAfter(BASE, add('08:00', '09:30', 16.06, 108.22), CREW, TZ)).toEqual([]);
    expect(collisionsAfter(BASE, add('07:00', '11:00', 16.06, 108.22, false), CREW, TZ)).toEqual(
      [],
    );
    const clashing = [...BASE, stop(4, '12:30', '13:30', 16.061, 108.221)];
    expect(collisionsAfter(clashing, add('08:00', '09:30', 16.06, 108.22), CREW, TZ)).toEqual([]);
  });
});

describe('the review in words', () => {
  it('words the guide’s reason keys and keeps what a person wrote', () => {
    expect(changeReason('check_fix_reorder')).toBe('moved for a shorter drive');
    expect(changeReason('undo: check_fix_clash')).toBe(
      'moved so it no longer runs into the stop before',
    );
    expect(changeReason('some_new_key')).toBe('moved so the day works');
    expect(changeReason('New time')).toBe('New time');
  });

  it('shows my answer with the tally and when the vote closes', () => {
    const now = new Date('2026-10-05T03:00:00Z');
    const vote = { yes: 1, needed: 2, closesAt: '2026-10-06T02:00:00Z', now };
    expect(voteLine({ ...vote, mine: 'yes', author: true })).toBe(
      'Your yes is counted · 1 of 2 yeses so far · closes in 23 h',
    );
    expect(voteLine({ ...vote, mine: 'no', author: false })).toBe(
      'You said not this · 1 of 2 yeses so far · closes in 23 h',
    );
    expect(voteLine({ ...vote, mine: null, author: false, closesAt: null })).toBe(
      '1 of 2 yeses so far',
    );
    expect(closesLine('2026-10-05T03:40:00Z', now)).toBe('closes in 40 min');
    expect(closesLine('2026-10-05T02:00:00Z', now)).toBe(null);
  });
});
