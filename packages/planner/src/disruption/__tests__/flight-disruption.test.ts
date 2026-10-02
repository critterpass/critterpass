import type { DisruptionAction } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  analyzeFlightImpact,
  classifyFlightActions,
  diffActions,
  planUndo,
  type FlightChange,
  type FlightImpactInput,
  type ImpactItem,
} from '../index';

const BALI = 'Asia/Makassar';
const ANA = '0190f0a0-0000-7000-8000-00000000000a';
const BEN = '0190f0a0-0000-7000-8000-00000000000b';
const CAL = '0190f0a0-0000-7000-8000-00000000000c';
const RIN = '0190f0a0-0000-7000-8000-00000000000d';
const EVE = '0190f0a0-0000-7000-8000-00000000000e';
const CREW = [ANA, BEN, CAL, RIN, EVE];
const DELAYED = [ANA, BEN, CAL];
const MADE = '0190f0a0-0000-7000-8000-0000000000f1';
const NOW = new Date('2026-10-15T01:00:00Z');
/** Bali wall time on the landing day (UTC+8). */
const bali = (hhmm: string, day = 15) =>
  new Date(`2026-10-${String(day).padStart(2, '0')}T${hhmm}:00+08:00`);
let seq = 0;

function item(title: string, start: string, fields: Partial<ImpactItem> = {}): ImpactItem {
  seq += 1;
  const n = String(seq).padStart(12, '0');
  return {
    id: `0190f0a0-0000-7000-9000-${n}`,
    stableId: `0190f0a0-0000-7000-a000-${n}`,
    title,
    startsAt: bali(start),
    endsAt: null,
    attendeeIds: null,
    role: 'activity',
    providerId: null,
    providerName: null,
    bookingId: null,
    locked: false,
    ...fields,
  };
}

const flight = (fields: Partial<FlightChange> = {}): FlightChange => ({
  segmentId: '0190f0a0-0000-7000-b000-000000000001',
  carrier: 'GA',
  flightNo: '402',
  cause: 'delay',
  scheduledArrival: bali('11:40'),
  newArrival: bali('13:20'),
  arrivalAirport: 'DPS',
  travellerIds: DELAYED,
  tz: BALI,
  ...fields,
});

const pickup = () =>
  item('Airport pickup', '12:10', {
    role: 'pickup',
    attendeeIds: DELAYED,
    providerId: MADE,
    providerName: 'Made',
  });

function run(
  items: readonly ImpactItem[],
  change: FlightChange = flight(),
  extra: Partial<FlightImpactInput> = {},
  inTrip = true,
) {
  const input: FlightImpactInput = {
    change,
    crewIds: CREW,
    items,
    leaveBys: [],
    otherArrivals: [],
    ...extra,
  };
  const impact = analyzeFlightImpact(input);
  return { impact, rows: classifyFlightActions(change, impact, { now: NOW, inTrip }) };
}

const byKind = (rows: readonly DisruptionAction[], kind: string) =>
  rows.filter((row) => row.kind === kind);

describe('flight disruption fixtures', () => {
  it('delay: a pickup with a driver is a draft needing a yes, and its retime waits on the reply', () => {
    const { impact, rows } = run([pickup()]);
    expect(impact.facts).toMatchObject({ new_arrival: '13:20', delay_min: 100, ready_at: '13:50' });
    const [vendor] = byKind(rows, 'contact_vendor');
    expect(vendor).toMatchObject({
      state: 'draft_ready',
      autonomous: false,
      label: 'Ask Made to pick you up at 13:50?',
      decider: { policy: 'any_affected', threshold: 1 },
    });
    expect(byKind(rows, 'reschedule_pickup')[0]).toMatchObject({
      state: 'waiting_vendor',
      autonomous: false,
      depends_on: vendor?.id,
      facts: { from: '12:10', to: '13:50' },
    });
    expect(byKind(rows, 'refresh_live_activity')[0]?.autonomous).toBe(true);
    expect(byKind(rows, 'insert_briefing')).toHaveLength(1);
  });

  it('delay under half an hour: nothing to do', () => {
    const { impact, rows } = run([pickup()], flight({ newArrival: bali('12:00') }));
    expect(impact.material).toBe(false);
    expect(rows).toEqual([]);
  });

  it('in trip, a crew-wide lunch asks any affected member (time-critical)', () => {
    const { rows } = run([item('Warung lunch', '13:30', { role: 'meal' })]);
    expect(byKind(rows, 'retime_item')[0]).toMatchObject({
      state: 'needs_yes',
      autonomous: false,
      facts: { from: '13:30', to: '15:20' },
      decider: { policy: 'any_affected', threshold: 1, tie_breaker: null },
      affected_user_ids: [...CREW].sort(),
    });
  });

  it('before the trip, a crew-wide change asks the affected majority, organiser breaking ties', () => {
    const { rows } = run([item('Warung lunch', '13:30', { role: 'meal' })], flight(), {}, false);
    expect(byKind(rows, 'retime_item')[0]?.decider).toMatchObject({
      policy: 'majority_of_affected',
      threshold: 3,
      tie_breaker: 'organiser',
    });
  });

  it('an item only the delayed travellers attend moves on its own', () => {
    const { rows } = run([item('Surf lesson', '14:00', { attendeeIds: DELAYED })]);
    expect(byKind(rows, 'retime_item')[0]).toMatchObject({
      state: 'planned',
      autonomous: true,
      reversible: true,
      decider: null,
    });
  });

  it("a booked item, even only the travellers', needs a yes (money)", () => {
    const booked = item('Spa', '14:00', {
      attendeeIds: DELAYED,
      bookingId: '0190f0a0-0000-7000-c000-000000000001',
    });
    const { rows } = run([booked]);
    expect(byKind(rows, 'retime_item')[0]).toMatchObject({
      state: 'needs_yes',
      booking_impact: true,
      decider: { policy: 'majority_of_affected' },
    });
  });

  it("a must-do, even only the travellers', needs a yes", () => {
    const { rows } = run([item('Temple', '14:00', { attendeeIds: DELAYED, locked: true })]);
    expect(byKind(rows, 'retime_item')[0]).toMatchObject({ state: 'needs_yes', autonomous: false });
  });

  it('cancellation: a rebook link, a draft for the driver, no retimes', () => {
    const { impact, rows } = run([pickup()], flight({ cause: 'cancelled', newArrival: null }));
    expect(impact.readyAt).toBeNull();
    expect(byKind(rows, 'rebook_flight')[0]).toMatchObject({
      state: 'link',
      autonomous: false,
      label: 'Rebook on GA',
    });
    expect(byKind(rows, 'contact_vendor')[0]?.label).toBe("Tell Made the flight won't land today?");
    expect(rows.some((row) => row.class === 'plan')).toBe(false);
  });

  it('missed connection: the traveller rebooks, nothing retimes', () => {
    const { rows } = run(
      [item('Surf lesson', '14:00', { attendeeIds: DELAYED })],
      flight({ cause: 'missed_connection', newArrival: null }),
    );
    expect(byKind(rows, 'rebook_flight')).toHaveLength(1);
    expect(byKind(rows, 'retime_item')).toHaveLength(0);
  });

  it('diversion: times follow the diversion landing and the driver is asked', () => {
    const { impact, rows } = run(
      [pickup()],
      flight({ cause: 'diverted', newArrival: bali('12:05'), arrivalAirport: 'SUB' }),
    );
    expect(impact.facts).toMatchObject({ airport: 'SUB', ready_at: '12:35' });
    expect(byKind(rows, 'contact_vendor')[0]?.state).toBe('draft_ready');
  });

  it('split crew: the others are told nothing changes, with their own landing', () => {
    const { impact, rows } = run([], flight(), {
      otherArrivals: [{ userId: RIN, arrival: bali('22:40') }],
    });
    expect(impact.unaffected).toEqual([
      { userId: RIN, arrival: bali('22:40') },
      { userId: EVE, arrival: null },
    ]);
    expect(byKind(rows, 'notify_unaffected')[0]).toMatchObject({
      autonomous: true,
      affected_user_ids: [RIN, EVE],
    });
  });

  it('leaves earlier, later and next-day items alone and recomputes only touched leave-bys', () => {
    const breakfast = item('Breakfast', '08:00', { attendeeIds: DELAYED });
    const dinner = item('Dinner', '19:30', { attendeeIds: DELAYED });
    const tomorrow = {
      ...item('Boat', '07:00', { attendeeIds: DELAYED }),
      startsAt: bali('07:00', 16),
    };
    const surf = item('Surf lesson', '14:00', { attendeeIds: DELAYED });
    const { impact, rows } = run([breakfast, dinner, tomorrow, surf], flight(), {
      leaveBys: [
        { planItemStableId: surf.stableId, participantIds: DELAYED },
        { planItemStableId: tomorrow.stableId, participantIds: DELAYED },
      ],
    });
    expect(impact.affected.map((entry) => entry.item.title)).toEqual(['Surf lesson']);
    expect(byKind(rows, 'recompute_leave_by')[0]?.facts).toEqual({ count: 1 });
  });
});

describe('re-trigger and undo', () => {
  const surf = item('Surf lesson', '14:00', { attendeeIds: DELAYED });
  const first = run([surf, pickup()]).rows.map((row) =>
    row.state === 'planned' ? { ...row, state: 'done' as const } : row,
  );

  it('keeps unchanged rows with their state and re-evaluates changed ones', () => {
    const later = run([surf, pickup()], flight({ newArrival: bali('14:00') })).rows;
    const diff = diffActions(first, later);
    expect(diff.kept.find((row) => row.kind === 'refresh_live_activity')?.state).toBe('done');
    expect(diff.fresh.map((row) => row.facts['to'])).toContain('16:00');
    expect(diff.obsolete.find((row) => row.kind === 'retime_item')?.state).toBe('done');
  });

  it('a delay that shrinks away makes every previous row obsolete', () => {
    const gone = run([surf], flight({ newArrival: bali('11:50') })).rows;
    expect(diffActions(first, gone).obsolete).toHaveLength(first.length);
  });

  it('undo walks newest first: undoes done plan rows, compensates sent messages, withdraws drafts', () => {
    const sent = first.map((row) =>
      row.kind === 'contact_vendor' ? { ...row, state: 'sent' as const } : row,
    );
    const steps = planUndo(sent);
    expect(steps.map((step) => [step.step, step.action.kind])).toEqual([
      ['undo_guide_action', 'retime_item'],
      ['withdraw', 'reschedule_pickup'],
      ['compensate', 'contact_vendor'],
    ]);
    expect(steps[2]).toMatchObject({ draft: 'Tell Made: back to 12:10?' });
  });
});

describe('autonomy invariants', { timeout: 60_000 }, () => {
  const member = fc.constantFrom(...CREW);
  const itemArb = fc.record({
    minutes: fc.integer({ min: 0, max: 600 }),
    attendees: fc.option(fc.uniqueArray(member, { minLength: 1, maxLength: 5 }), { nil: null }),
    role: fc.constantFrom('pickup', 'check_in', 'meal', 'activity', 'transfer', 'other'),
    vendor: fc.boolean(),
    booked: fc.boolean(),
    locked: fc.boolean(),
  });

  it('never runs a vendor, link, booked, locked or others-affecting row by itself', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { maxLength: 6 }),
        fc.uniqueArray(member, { minLength: 1, maxLength: 5 }),
        fc.constantFrom('delay', 'cancelled', 'diverted', 'missed_connection'),
        fc.integer({ min: 0, max: 400 }),
        fc.boolean(),
        (specs, travellers, cause, delay, inTrip) => {
          const items = specs.map((spec, index) => ({
            ...item(`Item ${index}`, '10:00'),
            startsAt: new Date(bali('10:00').getTime() + spec.minutes * 60_000),
            attendeeIds: spec.attendees,
            role: spec.role,
            providerId: spec.vendor ? MADE : null,
            providerName: spec.vendor ? 'Made' : null,
            bookingId: spec.booked ? '0190f0a0-0000-7000-c000-000000000001' : null,
            locked: spec.locked,
          }));
          const lands = cause === 'delay' || cause === 'diverted';
          const change = flight({
            cause,
            travellerIds: travellers,
            newArrival: lands ? new Date(bali('11:40').getTime() + delay * 60_000) : null,
          });
          const { rows } = run(items, change, {}, inTrip);
          for (const row of rows) {
            if (row.class === 'vendor' || row.class === 'link') expect(row.autonomous).toBe(false);
            if (row.class !== 'plan' || !row.autonomous) continue;
            expect(row.booking_impact).toBe(false);
            expect(row.affected_user_ids.every((id) => travellers.includes(id))).toBe(true);
            expect(row.provider_id).toBeNull();
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
