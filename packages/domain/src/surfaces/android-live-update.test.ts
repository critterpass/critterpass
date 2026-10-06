import { describe, expect, it } from 'vitest';

import {
  androidProgressSpec,
  flightProgressSpec,
  leaveByProgressSpec,
  meetUpProgressSpec,
  progressSpecSchema,
  sosProgressSpec,
} from './android-live-update';
import type { FlightLaState } from './la-flight';
import type { LeaveByLaState } from './la-leave-by';
import type { MeetUpLaState } from './la-meetup';

const now = new Date('2026-10-06T06:00:00Z');
const nowSec = Math.floor(now.getTime() / 1000);

const leaveBy = (patch: Partial<LeaveByLaState> = {}): LeaveByLaState => ({
  seq: 3,
  leave_at: nowSec + 20 * 60,
  state: 'soon',
  up_count: 2,
  total: 4,
  pips: [],
  leg: 0,
  progress: 3,
  place_line: 'Pickup at the villa gate',
  guide_line: 'Shoes by the door.',
  ...patch,
});

const flight = (patch: Partial<FlightLaState> = {}): FlightLaState => ({
  seq: 1,
  phase: 'check_in',
  sched: nowSec + 90 * 60,
  est: null,
  boarding_at: nowSec + 50 * 60,
  arr_at: nowSec + 270 * 60,
  gate: 'G12',
  terminal: '1',
  seat: '14A',
  delay_min: null,
  colour: 'default',
  pickup: null,
  grab_cta: false,
  ...patch,
});

describe('android live update spec', () => {
  it('draws one segment per trail leg with Tokek as the progress and counts down before leaving', () => {
    const spec = leaveByProgressSpec(
      { legs: ['Villa', 'Pickup', 'Trailhead'] },
      leaveBy({ leg: 1, progress: 4 }),
      now,
    );
    expect(spec.segments).toEqual([
      { length: 10, tone: 'done' },
      { length: 10, tone: 'ahead' },
    ]);
    expect(spec.points.map((point) => point.position)).toEqual([0, 10, 20]);
    expect(spec.progress).toBe(14);
    expect(spec.chip).toEqual({ until: nowSec + 20 * 60 });
    expect(spec.metrics).toEqual([
      { key: 'leave_in', value: 20, unit: 'min' },
      { key: 'up', value: 2, unit: 'count' },
    ]);
    expect(spec.style).toBe('metric');
  });

  it('shows who is up once it is time to go', () => {
    const spec = leaveByProgressSpec({ legs: ['Villa', 'Summit'] }, leaveBy({ state: 'go' }), now);
    expect(spec.status).toBe('leave_by_go');
    expect(spec.chip).toEqual({ count: 2, of: 4 });
    expect(spec.metrics.map((metric) => metric.key)).toEqual(['up']);
  });

  it('fills the flight leg with time aloft and counts down to landing', () => {
    const departed = flight({
      phase: 'departed',
      sched: nowSec - 60 * 60,
      arr_at: nowSec + 60 * 60,
      delay_min: 15,
    });
    const spec = flightProgressSpec({ flight_no: 'SQ 938', route: 'SIN → DPS' }, departed, now);
    expect(spec.title).toBe('SQ 938 · SIN → DPS');
    expect(spec.progress).toBe(25);
    expect(spec.chip).toEqual({ until: nowSec + 60 * 60 });
    expect(spec.metrics).toEqual([
      { key: 'lands_in', value: 60, unit: 'min' },
      { key: 'delay', value: 15, unit: 'min' },
    ]);
  });

  it('marks a cancelled flight as an alert with no progress', () => {
    const spec = flightProgressSpec(
      { flight_no: 'VJ 1', route: 'SGN → DAD' },
      flight({ phase: 'cancelled' }),
      now,
    );
    expect(spec.progress).toBe(0);
    expect(spec.segments.every((segment) => segment.tone === 'alert')).toBe(true);
    expect(spec.chip).toEqual({ key: 'cancelled' });
  });

  it('puts the furthest crewmate as the meet-up progress', () => {
    const state: MeetUpLaState = {
      seq: 1,
      state: 'gathering',
      eta_min: 12,
      all_under_5: false,
      members: [
        { uid_hash: 'aaaaaaaa', initial: 'A', tone: 0, step: 7, min: 12, arrived: false },
        { uid_hash: 'bbbbbbbb', initial: 'B', tone: 1, step: 0, min: 0, arrived: true },
      ],
      stragglers: [],
      end_reason: null,
    };
    const spec = meetUpProgressSpec({ place_name: 'Dragon Bridge' }, state);
    expect(spec.progress).toBe(3);
    expect(spec.points).toEqual([
      { position: 3, tone: 'member' },
      { position: 10, tone: 'done' },
    ]);
    expect(spec.chip).toEqual({ min: 12 });
  });

  it('keeps the sender SOS indeterminate until someone answers', () => {
    const open = sosProgressSpec(
      { sender_name: 'Linh' },
      { seq: 1, state: 'open', responders: 0, last_seen_min: null },
    );
    expect(open.indeterminate).toBe(true);
    expect(open.metrics).toEqual([{ key: 'coming', value: 0, unit: 'count' }]);
  });

  it('answers null for kinds Android only notifies about and for states that do not parse', () => {
    expect(androidProgressSpec('vote', {}, {}, now)).toBeNull();
    expect(androidProgressSpec('storm', {}, {}, now)).toBeNull();
    expect(
      androidProgressSpec('leave_by', { legs: ['A', 'B'] }, { state: 'soon' }, now),
    ).toBeNull();
    const spec = androidProgressSpec('leave_by', { legs: ['A', 'B'] }, leaveBy(), now);
    expect(progressSpecSchema.safeParse(spec).success).toBe(true);
  });
});
