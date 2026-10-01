import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  admitActivity,
  assertNoForbiddenFields,
  buildCritterLaState,
  buildFlightLaAttributes,
  buildFlightLaState,
  buildLeaveByLaAttributes,
  buildLeaveByLaState,
  buildMeetUpLaState,
  buildVoteLaState,
  flightLaPhase,
  forbiddenFields,
  LA_CONTENT_BUDGET_BYTES,
  LA_KIND_SPECS,
  laApnsPayload,
  laMemberHash,
  laPayloadFits,
  type FlightLaInput,
  type LeaveByLaInput,
  type MeetUpLaInput,
} from '../live-activities';
import { jsonBytes } from '../push-payload';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const crew = Array.from({ length: 16 }, (_, i) => uid(i + 1));
const LEAVE_AT = new Date('2026-10-02T21:10:00Z');

const leaveBy = (over: Partial<LeaveByLaInput> = {}): LeaveByLaInput => ({
  leaveById: uid(100),
  tripId: uid(101),
  title: 'Sunrise trek up Mount Batur with the whole crew',
  placeName: 'Trailhead',
  pickupPlace: 'Pickup at the villa gate',
  hasPickup: true,
  leaveAt: LEAVE_AT,
  state: 'scheduled',
  legMinutes: [20, 40, 90],
  participants: crew.map((id, i) => ({ uid: id, readiness: i < 4 ? 'up' : 'not_up' })),
  guideLine: 'Rise and shine. Headlamp is by the door.',
  labels: { stay: 'Villa', pickup: 'Pickup' },
  guide: 'chava',
  ...over,
});

const flight = (over: Partial<FlightLaInput> = {}): FlightLaInput => ({
  bookingId: uid(200),
  segmentId: uid(201),
  carrier: 'VN',
  flightNo: '112',
  depAirport: 'SGN',
  arrAirport: 'DAD',
  source: 'manual',
  status: 'scheduled',
  schedDepAt: new Date('2026-10-02T00:05:00Z'),
  estDepAt: null,
  actDepAt: null,
  schedArrAt: new Date('2026-10-02T01:25:00Z'),
  estArrAt: null,
  actArrAt: null,
  boardingAt: new Date('2026-10-01T23:25:00Z'),
  gate: '12',
  terminal: '1',
  seat: '14A',
  delayMin: null,
  pickup: null,
  ...over,
});

const meetUp: MeetUpLaInput = {
  meetupId: uid(300),
  tripId: uid(101),
  placeName: 'Campuhan Ridge',
  meetAt: new Date('2026-10-03T10:00:00Z'),
  endReason: null,
  members: crew.map((id, i) => ({
    uid: id,
    name: `Member ${i}`,
    tone: i % 8,
    etaMin: i === 0 ? null : i * 2,
    arrived: i === 15,
    statusText: 'Scooter · 2 km',
  })),
};

describe('Live Activity content builders', () => {
  it('keeps every leave-by, meet-up and vote state inside the budget for a 16-member crew', () => {
    const states = [
      buildLeaveByLaState(leaveBy(), new Date('2026-10-02T20:48:00Z'), 12),
      buildMeetUpLaState(meetUp, new Date('2026-10-03T09:40:00Z'), 3),
      buildVoteLaState(
        {
          pollId: uid(400),
          question: 'Where do we eat tonight? Pick one before the sun goes down',
          status: 'open',
          closesAt: new Date('2026-10-03T12:00:00Z'),
          options: [1, 2, 3, 4, 5].map((n) => ({
            id: uid(400 + n),
            label: `Option ${n}`,
            count: n,
          })),
          voterIds: crew,
          eligibleCount: 16,
          winnerOptionId: null,
        },
        4,
      ),
    ];
    for (const state of states)
      expect(jsonBytes(state)).toBeLessThanOrEqual(LA_CONTENT_BUDGET_BYTES);
    const start = laApnsPayload({
      event: 'start',
      contentState: states[0]!,
      timestamp: new Date(),
      alert: { title: 'Leave by 03:10', body: 'Four of you are up.' },
      start: {
        attributesType: 'LeaveByActivityAttributes',
        attributes: buildLeaveByLaAttributes(leaveBy()),
      },
    });
    expect(laPayloadFits(start)).toBe(true);
  });

  it('validates every builder output against its own contract', () => {
    const now = new Date('2026-10-02T20:48:00Z');
    expect(() =>
      LA_KIND_SPECS.leave_by.contentState?.parse(buildLeaveByLaState(leaveBy(), now, 1)),
    ).not.toThrow();
    expect(() =>
      LA_KIND_SPECS.leave_by.attributes.parse(buildLeaveByLaAttributes(leaveBy())),
    ).not.toThrow();
    expect(() =>
      LA_KIND_SPECS.meet_up.contentState?.parse(buildMeetUpLaState(meetUp, now, 1)),
    ).not.toThrow();
    const f = flight();
    expect(() =>
      LA_KIND_SPECS.flight.contentState?.parse(buildFlightLaState(f, 'check_in', now, 1)),
    ).not.toThrow();
    expect(() => LA_KIND_SPECS.flight.attributes.parse(buildFlightLaAttributes(f))).not.toThrow();
  });

  it('never lets a coordinate or budget field into a contract', () => {
    for (const spec of Object.values(LA_KIND_SPECS)) {
      expect(forbiddenFields(spec.attributes)).toEqual([]);
      if (spec.contentState !== null) expect(forbiddenFields(spec.contentState)).toEqual([]);
    }
    const leaky = z.object({
      pips: z.array(z.object({ lat: z.number(), budget_max: z.number() })),
    });
    expect(forbiddenFields(leaky)).toEqual(['pips[].lat', 'pips[].budget_max']);
    expect(() => assertNoForbiddenFields('leaky', leaky)).toThrow(/coordinates or budgets/);
  });
});

describe('leave-by activity', () => {
  it('walks waiting → soon → go → late → done', () => {
    const at = (iso: string) => buildLeaveByLaState(leaveBy(), new Date(iso), 1).state;
    expect(at('2026-10-02T19:00:00Z')).toBe('waiting');
    expect(at('2026-10-02T20:48:00Z')).toBe('soon');
    expect(at('2026-10-02T21:11:00Z')).toBe('go');
    expect(at('2026-10-02T21:16:00Z')).toBe('late');
    expect(at('2026-10-03T00:00:00Z')).toBe('done');
    const departed = buildLeaveByLaState(leaveBy({ state: 'departed' }), LEAVE_AT, 1);
    expect(departed.state).toBe('go');
    const cancelled = buildLeaveByLaState(leaveBy({ state: 'cancelled' }), LEAVE_AT, 1);
    expect(cancelled.state).toBe('done');
  });

  it('is on time, not late, once everyone is up', () => {
    const allUp = leaveBy({ participants: crew.map((id) => ({ uid: id, readiness: 'up' })) });
    expect(buildLeaveByLaState(allUp, new Date('2026-10-02T21:30:00Z'), 1).state).toBe('go');
  });

  it('counts pips by member hash so each phone finds its own', () => {
    const state = buildLeaveByLaState(leaveBy(), LEAVE_AT, 7);
    expect(state.up_count).toBe(4);
    expect(state.total).toBe(16);
    expect(state.pips[0]).toEqual({ uid_hash: laMemberHash(uid(100), crew[0]!), up: true });
    expect(laMemberHash('a', 'b')).toMatch(/^[0-9a-f]{8}$/);
    expect(laMemberHash('a', 'b')).not.toBe(laMemberHash('a', 'c'));
  });

  it('lays out the trail from the stay through the pickup to the stop', () => {
    expect(buildLeaveByLaAttributes(leaveBy()).legs).toEqual([
      'Villa',
      'Pickup',
      'Trailhead',
      'Sunrise trek up Mount B…',
    ]);
    expect(
      buildLeaveByLaAttributes(leaveBy({ hasPickup: false, placeName: null })).legs,
    ).toHaveLength(2);
  });

  it('moves Tokek along the legs after leaving', () => {
    const at = (min: number) =>
      buildLeaveByLaState(leaveBy(), new Date(LEAVE_AT.getTime() + min * 60_000), 1);
    expect(at(-60)).toMatchObject({ leg: 0, progress: 0 });
    expect(at(10)).toMatchObject({ leg: 0, progress: 5 });
    expect(at(30)).toMatchObject({ leg: 1 });
    expect(at(500)).toMatchObject({ leg: 3, progress: 0 });
  });
});

describe('flight activity', () => {
  it('has no activity before three hours out and a phase after', () => {
    const f = flight();
    expect(flightLaPhase(f, new Date('2026-10-01T20:00:00Z'))).toBeNull();
    expect(flightLaPhase(f, new Date('2026-10-01T21:30:00Z'))).toBe('check_in');
    expect(flightLaPhase(f, new Date('2026-10-01T23:30:00Z'))).toBe('boarding');
    expect(flightLaPhase(flight({ status: 'cancelled' }), new Date())).toBe('cancelled');
  });

  it('turns orange ten minutes before boarding', () => {
    const f = flight();
    const early = buildFlightLaState(f, 'check_in', new Date('2026-10-01T23:00:00Z'), 1);
    const late = buildFlightLaState(f, 'check_in', new Date('2026-10-01T23:16:00Z'), 1);
    expect(early.colour).toBe('default');
    expect(late.colour).toBe('orange');
  });

  it('badges only mailbox imports, whatever the source', () => {
    expect(buildFlightLaAttributes(flight({ source: 'mailbox' })).from_email).toBe(true);
    for (const source of ['manual', 'paste', 'scan', 'forward'] as const) {
      expect(buildFlightLaAttributes(flight({ source })).from_email).toBe(false);
    }
  });

  it('shows the booked pickup on the ground, or the Grab hand-off without one', () => {
    const now = new Date('2026-10-02T01:40:00Z');
    const none = buildFlightLaState(flight(), 'landed', now, 1);
    expect(none).toMatchObject({ pickup: null, grab_cta: true });
    const booked = buildFlightLaState(
      flight({ pickup: { name: 'Made', line: 'Door 3 with a sign' } }),
      'pickup',
      now,
      1,
    );
    expect(booked).toMatchObject({ pickup: { name: 'Made' }, grab_cta: false });
  });
});

describe('meet-up, vote and critter activities', () => {
  it('buckets ETAs onto the line and lists the two furthest out', () => {
    const state = buildMeetUpLaState(meetUp, new Date('2026-10-03T09:40:00Z'), 1);
    expect(state.members[15]).toMatchObject({ step: 0, arrived: true });
    expect(state.members[0]).toMatchObject({ step: 10, min: null });
    expect(state.stragglers).toHaveLength(2);
    expect(state.stragglers.map((s) => s.line)).toEqual([
      'Scooter · 2 km',
      'Scooter · 2 km · 28 min',
    ]);
    expect(state.state).toBe('gathering');
    const ended = buildMeetUpLaState({ ...meetUp, endReason: 'boost_ended' }, new Date(), 2);
    expect(ended).toMatchObject({ state: 'ended', end_reason: 'boost_ended' });
  });

  it('stamps voters by hash and marks the leader', () => {
    const state = buildVoteLaState(
      {
        pollId: uid(400),
        question: 'Dinner?',
        status: 'open',
        closesAt: new Date(),
        options: [
          { id: uid(401), label: 'Warung', count: 3 },
          { id: uid(402), label: 'Beach', count: 1 },
        ],
        voterIds: [crew[0]!],
        eligibleCount: 6,
        winnerOptionId: null,
      },
      1,
    );
    expect(state.voted).toEqual([laMemberHash(uid(400), crew[0]!)]);
    expect(state.tallies.map((t) => t.leading)).toEqual([true, false]);
  });

  it('fills the dwell ring in ten steps and sharpens the silhouette', () => {
    const rings = Array.from({ length: 11 }, (_, i) =>
      buildCritterLaState(
        {
          spawnId: uid(500),
          silhouetteKey: 's',
          state: 'dwelling',
          distanceBand: 'here',
          dwellFraction: i / 10,
          foundKey: null,
        },
        i,
      ),
    );
    expect(rings.map((r) => r.ring)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rings[0]?.blur_stage).toBe(3);
    expect(rings[10]?.blur_stage).toBe(0);
  });
});

describe('two activities per phone', () => {
  const slot = (kind: keyof typeof LA_KIND_SPECS, n: number) => ({ kind, refId: uid(n) });

  it('admits freely below the cap and re-admits a running one', () => {
    expect(admitActivity([slot('vote', 1)], slot('flight', 2))).toEqual({ admit: true, evict: [] });
    const full = [slot('vote', 1), slot('flight', 2)];
    expect(admitActivity(full, slot('flight', 2))).toEqual({ admit: true, evict: [] });
  });

  it('lets SOS push the weakest off, and refuses a weaker newcomer', () => {
    const full = [slot('leave_by', 1), slot('vote', 2)];
    expect(admitActivity(full, slot('sos', 3))).toEqual({ admit: true, evict: [slot('vote', 2)] });
    expect(admitActivity(full, slot('critter_nearby', 4))).toEqual({ admit: false });
  });

  it('does not count the AlarmKit alarm against the cap', () => {
    expect(admitActivity([slot('alarm', 1), slot('leave_by', 2)], slot('flight', 3))).toEqual({
      admit: true,
      evict: [],
    });
  });
});

describe('APNs payloads', () => {
  it('refuses a start without an alert and shapes an update', () => {
    expect(() =>
      laApnsPayload({ event: 'start', contentState: {}, timestamp: new Date() }),
    ).toThrow();
    const update = laApnsPayload({
      event: 'update',
      contentState: { seq: 2 },
      timestamp: new Date(1_000_000),
      staleAt: new Date(2_000_000),
      relevance: 80,
      alert: { title: 'Time to go', body: 'Leave now', sound: true },
    });
    expect(update.aps).toEqual({
      timestamp: 1000,
      event: 'update',
      'content-state': { seq: 2 },
      'stale-date': 2000,
      'relevance-score': 80,
      alert: { title: 'Time to go', body: 'Leave now' },
      sound: 'default',
    });
  });
});
