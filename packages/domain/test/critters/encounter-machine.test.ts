import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ENCOUNTER_CONFIG as C,
  encounterProgress,
  initialEncounterState,
  reduceEncounter,
  type EncounterEvent,
  type EncounterPhase,
  type EncounterState,
} from '../../src/critters';

const S = 1000;
const fresh = (dwell = 300): EncounterState =>
  initialEncounterState({ dwell_target_s: dwell, radius_m: 50 });
const fix = (at_s: number, distance_m: number, accuracy_m = 10): EncounterEvent => ({
  type: 'fix',
  at_ms: at_s * S,
  distance_m,
  accuracy_m,
});
const tick = (at_s: number): EncounterEvent => ({ type: 'tick', at_ms: at_s * S });
const hold = (at_s: number): EncounterEvent => ({ type: 'hold', at_ms: at_s * S });
const leave = (at_s: number): EncounterEvent => ({ type: 'leave', at_ms: at_s * S });

function run(events: readonly EncounterEvent[], state = fresh()): EncounterState {
  return events.reduce((s, e) => reduceEncounter(s, e, C), state);
}

describe('encounter transitions', () => {
  const cases: readonly {
    name: string;
    events: EncounterEvent[];
    phase: EncounterPhase;
    dwell?: number;
  }[] = [
    { name: 'idle stays idle outside the radius', events: [fix(0, 80)], phase: 'idle' },
    {
      name: 'idle ignores an inaccurate fix inside',
      events: [fix(0, 10, 60)],
      phase: 'idle',
    },
    { name: 'idle → accruing on an accurate fix inside', events: [fix(0, 20)], phase: 'accruing' },
    {
      name: 'accruing → ready once dwell reaches the target',
      events: [fix(0, 20), tick(299), fix(300, 25)],
      phase: 'ready',
      dwell: 300,
    },
    {
      name: 'ready → befriended on hold',
      events: [fix(0, 20), fix(300, 20), hold(301)],
      phase: 'befriended',
    },
    {
      name: 'accruing ignores hold (hold completes only when ready)',
      events: [fix(0, 20), fix(100, 20), hold(101)],
      phase: 'accruing',
    },
    {
      name: 'accruing → draining when leaving past radius + hysteresis',
      events: [fix(0, 20), fix(100, 75)],
      phase: 'draining',
      dwell: 100,
    },
    {
      name: 'the hysteresis band neither exits nor fills',
      events: [fix(0, 20), fix(60, 65), fix(120, 65)],
      phase: 'accruing',
      dwell: 60,
    },
    {
      name: 'poor accuracy inside holds the ring',
      events: [fix(0, 20), fix(60, 20, 80), fix(120, 20)],
      phase: 'accruing',
      dwell: 60,
    },
    {
      name: 'a poor fix widens the exit (radius + accuracy)',
      events: [fix(0, 20), fix(60, 90, 45)],
      phase: 'accruing',
    },
    {
      name: 'ready → draining on an explicit leave',
      events: [fix(0, 20), fix(300, 20), leave(310)],
      phase: 'draining',
    },
    {
      name: 'draining keeps the ring through the grace period',
      events: [fix(0, 20), fix(120, 80), tick(120 + 90)],
      phase: 'draining',
      dwell: 120,
    },
    {
      name: 'draining drains at a third of the fill speed after grace',
      events: [fix(0, 20), fix(120, 80), tick(120 + 90 + 30)],
      phase: 'draining',
      dwell: 110,
    },
    {
      name: 'draining → accruing on return, keeping what is left',
      events: [fix(0, 20), fix(120, 80), tick(240), fix(240, 10)],
      phase: 'accruing',
      dwell: 110,
    },
    {
      name: 'draining → ready on return when still full',
      events: [fix(0, 20), fix(400, 20), fix(410, 90), fix(450, 10)],
      phase: 'ready',
    },
    {
      name: 'draining → wandered_off when the ring empties',
      events: [fix(0, 20), fix(60, 80), tick(60 + 90 + 180)],
      phase: 'wandered_off',
      dwell: 0,
    },
    {
      name: 'wandered_off is final',
      events: [fix(0, 20), fix(60, 80), tick(400), fix(401, 10), tick(900)],
      phase: 'wandered_off',
    },
    {
      name: 'befriended is final',
      events: [fix(0, 20), fix(300, 20), hold(301), fix(302, 200), tick(900)],
      phase: 'befriended',
    },
  ];

  it.each(cases)('$name', ({ events, phase, dwell }) => {
    const state = run(events);
    expect(state.phase).toBe(phase);
    if (dwell !== undefined) expect(state.dwell_s).toBeCloseTo(dwell, 5);
  });

  it('records ready and resolved times', () => {
    const state = run([fix(0, 20), fix(300, 20), hold(305)]);
    expect(state.ready_at_ms).toBe(300 * S);
    expect(state.resolved_at_ms).toBe(305 * S);
  });

  it('uses the server-tuned grace and drain', () => {
    const tuned = { ...C, grace_s: 0, drain_ratio: 1 };
    const state = [fix(0, 20), fix(60, 80), tick(90)].reduce(
      (s, e) => reduceEncounter(s, e, tuned),
      fresh(),
    );
    expect(state.dwell_s).toBeCloseTo(30, 5);
  });

  it('never moves backwards in time', () => {
    const state = run([fix(100, 20), fix(50, 20), fix(160, 20)]);
    expect(state.dwell_s).toBeCloseTo(60, 5);
  });

  it('reports ring progress between 0 and 1', () => {
    expect(encounterProgress(run([fix(0, 20), fix(150, 20)]))).toBeCloseTo(0.5);
    expect(encounterProgress(run([fix(0, 20), fix(900, 20)]))).toBe(1);
  });
});
