import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VISIT_PARAMS,
  INITIAL_VISIT_STATE,
  stepVisit,
  visitParamsFor,
  type VisitEmit,
  type VisitInput,
  type VisitParams,
  type VisitState,
} from '../visit-machine';

const P: VisitParams = { ...DEFAULT_VISIT_PARAMS, radiusM: 100 };
const MIN = 60_000;

const fix = (at: number, distanceM: number, accuracyM = 10): VisitInput => ({
  type: 'fix',
  at,
  distanceM,
  accuracyM,
});
const tick = (at: number): VisitInput => ({ type: 'tick', at });

function run(inputs: readonly VisitInput[], params = P): { state: VisitState; emits: VisitEmit[] } {
  let state = INITIAL_VISIT_STATE;
  const emits: VisitEmit[] = [];
  for (const input of inputs) {
    const step = stepVisit(state, input, params);
    state = step.state;
    if (step.emit) emits.push(step.emit);
  }
  return { state, emits };
}

describe('visit machine', () => {
  it('arrives after a full dwell inside the radius, dated from the first inside fix', () => {
    const { state, emits } = run([fix(0, 300), fix(10_000, 50), fix(10_000 + 3 * MIN, 40)]);
    expect(emits).toEqual([{ type: 'arrived', arrivedAt: 10_000 }]);
    expect(state.phase).toBe('inside');
  });

  it('stays a candidate while the dwell is short', () => {
    const { state, emits } = run([fix(0, 50), fix(MIN, 60)]);
    expect(emits).toEqual([]);
    expect(state).toEqual({ phase: 'candidate', since: 0, lastAt: MIN });
  });

  it('drops the candidate when a good fix leaves the radius', () => {
    const { state, emits } = run([fix(0, 50), fix(MIN, 120), fix(3 * MIN, 50)]);
    expect(emits).toEqual([]);
    expect(state).toEqual({ phase: 'candidate', since: 3 * MIN, lastAt: 3 * MIN });
  });

  it('ignores fixes worse than the accuracy limit for position, but still runs the clock', () => {
    const { emits: none } = run([fix(0, 10, 80), fix(5 * MIN, 10, 80)]);
    expect(none).toEqual([]);
    const { emits } = run([fix(0, 10), fix(3 * MIN, 900, 80)]);
    expect(emits).toEqual([{ type: 'arrived', arrivedAt: 0 }]);
  });

  it('finishes a dwell on a tick when a stationary phone stops sending fixes', () => {
    const { emits } = run([fix(0, 20), tick(2 * MIN), tick(3 * MIN)]);
    expect(emits).toEqual([{ type: 'arrived', arrivedAt: 0 }]);
  });

  it('ticks do nothing outside or inside', () => {
    expect(run([tick(0), tick(10 * MIN)]).state).toEqual({ phase: 'outside', lastAt: 10 * MIN });
    const inside = run([fix(0, 20), fix(3 * MIN, 20), tick(30 * MIN)]);
    expect(inside.state).toEqual({ phase: 'inside', arrivedAt: 0, lastAt: 30 * MIN });
  });

  it('keeps the visit through jitter inside radius + hysteresis', () => {
    const { state, emits } = run([
      fix(0, 20),
      fix(3 * MIN, 20),
      fix(4 * MIN, 150),
      fix(9 * MIN, 159),
    ]);
    expect(emits).toHaveLength(1);
    expect(state.phase).toBe('inside');
  });

  it('leaves after two minutes beyond the hysteresis ring, dated from the first outside fix', () => {
    const { state, emits } = run([
      fix(0, 20),
      fix(3 * MIN, 20),
      fix(10 * MIN, 200),
      fix(11 * MIN, 400),
      fix(12 * MIN, 500),
    ]);
    expect(emits).toEqual([
      { type: 'arrived', arrivedAt: 0 },
      { type: 'left', arrivedAt: 0, leftAt: 10 * MIN },
    ]);
    expect(state).toEqual({ phase: 'outside', lastAt: 12 * MIN });
  });

  it('cancels leaving when a fix comes back inside the hysteresis ring', () => {
    const { state, emits } = run([
      fix(0, 20),
      fix(3 * MIN, 20),
      fix(10 * MIN, 200),
      fix(11 * MIN, 100),
    ]);
    expect(emits).toHaveLength(1);
    expect(state).toEqual({ phase: 'inside', arrivedAt: 0, lastAt: 11 * MIN });
  });

  it('leaves on a tick once the leave time has passed', () => {
    const { emits } = run([
      fix(0, 20),
      fix(3 * MIN, 20),
      fix(10 * MIN, 200),
      tick(11 * MIN),
      tick(12 * MIN),
    ]);
    expect(emits.at(-1)).toEqual({ type: 'left', arrivedAt: 0, leftAt: 10 * MIN });
  });

  it('ignores inputs older than the latest one', () => {
    const first = stepVisit(INITIAL_VISIT_STATE, fix(10_000, 20), P);
    const stale = stepVisit(first.state, fix(5_000, 900), P);
    expect(stale).toEqual({ state: first.state, emit: null });
  });

  it('derives params from the POI category, its own radius and overrides', () => {
    expect(visitParamsFor('food', null)).toMatchObject({ radiusM: 60, dwellMs: 10 * MIN });
    expect(visitParamsFor('temple_shrine', null).dwellMs).toBe(5 * MIN);
    expect(visitParamsFor('museum', 120).radiusM).toBe(120);
    expect(visitParamsFor('beach', null, { dwellMs: MIN }).dwellMs).toBe(MIN);
  });
});

describe('visit machine properties', { timeout: 60_000 }, () => {
  const inputArb = fc.oneof(
    fc.record({
      type: fc.constant('fix' as const),
      dt: fc.integer({ min: -5_000, max: 5 * MIN }),
      distanceM: fc.double({ min: 0, max: 400, noNaN: true }),
      accuracyM: fc.double({ min: 1, max: 120, noNaN: true }),
    }),
    fc.record({
      type: fc.constant('tick' as const),
      dt: fc.integer({ min: -5_000, max: 5 * MIN }),
    }),
  );

  it('never emits left before arrived, and alternates arrived/left', () => {
    fc.assert(
      fc.property(fc.array(inputArb, { maxLength: 200 }), (steps) => {
        let at = 0;
        const inputs: VisitInput[] = steps.map((step) => {
          at += step.dt;
          return step.type === 'tick'
            ? { type: 'tick', at }
            : { type: 'fix', at, distanceM: step.distanceM, accuracyM: step.accuracyM };
        });
        const { emits } = run(inputs);
        let open: number | null = null;
        for (const emit of emits) {
          if (emit.type === 'arrived') {
            expect(open).toBeNull();
            open = emit.arrivedAt;
          } else {
            expect(open).not.toBeNull();
            expect(emit.arrivedAt).toBe(open);
            expect(emit.leftAt).toBeGreaterThanOrEqual(emit.arrivedAt);
            open = null;
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});
