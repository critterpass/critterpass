import { describe, expect, it } from '@jest/globals';
import type { PlaceContextWire } from '@cp/domain';

import {
  addChangeSetOp,
  addPlanOp,
  addState,
  closedOn,
  crowdColumns,
  goAdvice,
  openState,
} from '../place-model';

const span = (start: string, end: string) => [{ start, end }];
const week = (spans: ReturnType<typeof span>) => ({
  weekly: { mo: spans, tu: spans, we: spans, th: spans, fr: spans, sa: spans, su: spans },
});
const TOKYO = 'Asia/Tokyo';

describe('whether a place is open', () => {
  it('reads unknown hours as unknown, never as closed', () => {
    expect(openState({}, TOKYO, new Date())).toBe('unknown');
    expect(openState({ weekly: {} }, TOKYO, new Date())).toBe('unknown');
    expect(openState(week(span('09:00', '17:00')), null, new Date())).toBe('unknown');
  });

  it("uses the place's own time zone", () => {
    const hours = week(span('09:00', '17:00'));
    // 01:00 UTC is 10:00 in Tokyo; 09:00 UTC is 18:00 there.
    expect(openState(hours, TOKYO, new Date('2027-04-03T01:00:00Z'))).toBe('open');
    expect(openState(hours, TOKYO, new Date('2027-04-03T09:00:00Z'))).toBe('closed');
  });

  it('knows a place that never closes', () => {
    expect(openState(week(span('00:00', '24:00')), TOKYO, new Date())).toBe('always');
  });

  it('is closed on a weekday without hours and on a dated exception', () => {
    const hours = {
      weekly: { ...week(span('09:00', '17:00')).weekly, mo: [] },
      exceptions: [{ date: '2027-04-03', spans: [] }],
    };
    expect(closedOn(hours, '2027-04-05')).toBe(true); // a Monday
    expect(closedOn(hours, '2027-04-06')).toBe(false);
    expect(closedOn(hours, '2027-04-03')).toBe(true);
    expect(closedOn({}, '2027-04-05')).toBe(false);
  });
});

describe('crowd columns', () => {
  it('shows the waking hours of a full forecast, scaled to 0–1', () => {
    const hourly = Array.from({ length: 24 }, (_, hour) => hour * 5);
    const columns = crowdColumns(hourly);
    expect(columns).toHaveLength(15);
    expect(columns[0]).toEqual({ hour: 6, level: 0.3 });
    expect(columns.at(-1)).toEqual({ hour: 20, level: 1 });
  });

  it('shows nothing without a whole day of data', () => {
    expect(crowdColumns(null)).toEqual([]);
    expect(crowdColumns([10, 20])).toEqual([]);
  });
});

describe('the quiet window as advice', () => {
  it('says when to be done by, when to arrive, or the hour to aim for', () => {
    expect(goAdvice({ start: '06:00', end: '07:30' })).toEqual({ kind: 'before', time: '07:30' });
    expect(goAdvice({ start: '19:00', end: '21:00' })).toEqual({ kind: 'after', time: '19:00' });
    expect(goAdvice({ start: '13:00', end: '15:00' })).toEqual({ kind: 'around', time: '13:00' });
    expect(goAdvice(null)).toBeNull();
  });
});

const context = (over: Partial<PlaceContextWire>): PlaceContextWire => ({
  poi_id: 'poi',
  trip_id: 'trip',
  stay: null,
  crowd: null,
  crew: { saved_by: [], yes_by: [] },
  qna: null,
  in_plan: null,
  suggested_slot: {
    day_no: 2,
    date: '2027-04-03',
    starts_at: '2027-04-02T21:00:00.000Z',
    ends_at: '2027-04-02T22:30:00.000Z',
    reason: 'quiet_window',
  },
  add_mode: 'apply',
  base_version: 'v1',
  ...over,
});

describe('ADD TO DAY', () => {
  it('offers the suggested slot at its local time', () => {
    expect(addState(context({}), TOKYO, null)).toEqual({
      kind: 'add',
      dayNo: 2,
      time: '06:00',
      mode: 'apply',
    });
  });

  it('shows the day once the place is in the plan, or was just added', () => {
    const inPlan = context({ in_plan: { day_no: 3, stable_id: 's', starts_at: null } });
    expect(addState(inPlan, TOKYO, null)).toEqual({ kind: 'planned', dayNo: 3 });
    expect(addState(context({}), TOKYO, 2)).toEqual({ kind: 'planned', dayNo: 2 });
  });

  it('offers nothing without a trip, a plan or a free slot', () => {
    expect(addState(null, TOKYO, null)).toEqual({ kind: 'none' });
    expect(addState(context({ base_version: null }), TOKYO, null)).toEqual({ kind: 'none' });
    expect(addState(context({ suggested_slot: null }), TOKYO, null)).toEqual({ kind: 'full' });
  });

  it('sends the organiser one add and a member the same add for the crew to okay', () => {
    const slot = context({}).suggested_slot!;
    const place = { poiId: 'poi', category: 'temple_shrine', tz: TOKYO };
    const added = {
      day_no: 2,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      tz: TOKYO,
      status: 'confirmed',
      poi_id: 'poi',
      category: 'temple_shrine',
    };
    expect(addPlanOp(slot, place, 'stable')).toEqual({ op: 'add', item: 'stable', new: added });
    expect(addChangeSetOp(slot, place, 'stable', ['a', 'b'], 'Added from Explore')).toEqual({
      op: 'add',
      target: 'stable',
      after: added,
      reason: 'Added from Explore',
      affected_user_ids: ['a', 'b'],
      booking_impact: false,
    });
  });
});
