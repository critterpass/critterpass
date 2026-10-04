/**
 * The placing screen's progress from reports that arrive in any order: a late or repeated report
 * never takes a step back, a hint ahead of the synced row ticks the steps it counts, a finished
 * job stays finished, and the placed stops and the change set are kept once known.
 */
import { describe, expect, it } from '@jest/globals';

import { INITIAL_PLACING, reducePlacing, type PlacingEvent } from '../progress';

const snapshot = (
  status: string,
  steps: { step: string; status: string }[],
  partial: unknown = null,
  resultRef: unknown = null,
): PlacingEvent => ({ kind: 'snapshot', status, steps, partial, resultRef });

describe('reducePlacing', () => {
  it('ticks the steps a hint counts, even ahead of the synced row', () => {
    const state = reducePlacing(INITIAL_PLACING, { kind: 'hint', step: 'routing', pct: 50 });
    expect(state.steps).toEqual({
      hours: 'done',
      locks: 'done',
      routing: 'running',
      needs_you: 'pending',
    });
    expect(state.status).toBe('running');
  });

  it('never takes a step back for a late or repeated report', () => {
    let state = reducePlacing(INITIAL_PLACING, { kind: 'hint', step: 'routing', pct: 75 });
    state = reducePlacing(
      state,
      snapshot('running', [
        { step: 'hours', status: 'done' },
        { step: 'locks', status: 'running' },
        { step: 'routing', status: 'pending' },
      ]),
    );
    state = reducePlacing(state, { kind: 'hint', step: 'hours', pct: 25 });
    expect(state.steps).toEqual({
      hours: 'done',
      locks: 'done',
      routing: 'done',
      needs_you: 'pending',
    });
  });

  it('keeps a finished job finished and its results once known', () => {
    const placed = [{ idea_id: 'a', day_no: 6, number: 1 }];
    let state = reducePlacing(
      INITIAL_PLACING,
      snapshot(
        'succeeded',
        [{ step: 'needs_you', status: 'done' }],
        {
          routing: { days: [6], placed },
          needs_you: { change_set_id: 'cs-1', left: [{ idea_id: 'b', reason: 'split' }] },
        },
        { change_set_id: 'cs-1' },
      ),
    );
    state = reducePlacing(state, snapshot('running', [], null));
    expect(state.status).toBe('succeeded');
    expect(state.placed).toEqual(placed);
    expect(state.left).toEqual([{ idea_id: 'b', reason: 'split' }]);
    expect(state.changeSetId).toBe('cs-1');
  });

  it('ignores steps and statuses it does not know', () => {
    const state = reducePlacing(
      INITIAL_PLACING,
      snapshot('paused', [{ step: 'teleport', status: 'done' }]),
    );
    expect(state).toEqual(INITIAL_PLACING);
  });
});
