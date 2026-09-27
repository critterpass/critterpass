import { describe, expect, it } from 'vitest';

import { agentInputHash, alignSteps, initialSteps, stepsPct, updateStep } from '../src';

describe('agent job step bookkeeping', () => {
  it('hashes equal inputs equally whatever their key order', () => {
    const a = agentInputHash({ trip_id: 't', days: [1, 2], opts: { a: 1, b: undefined } });
    const b = agentInputHash({ opts: { a: 1 }, days: [1, 2], trip_id: 't' });
    expect(a).toBe(b);
    expect(agentInputHash({ trip_id: 't', days: [2, 1] })).not.toBe(a);
  });

  it('realigns stored progress to the current step ids', () => {
    const stored = updateStep(initialSteps(['load', 'draft', 'old']), 'load', { status: 'done' });
    const aligned = alignSteps(stored, ['load', 'draft', 'persist']);
    expect(aligned.map((s) => [s.step, s.status])).toEqual([
      ['load', 'done'],
      ['draft', 'pending'],
      ['persist', 'pending'],
    ]);
    expect(alignSteps('not a list', ['a'])).toEqual(initialSteps(['a']));
  });

  it('reports whole-percent progress, 100 only once every step is done', () => {
    let steps = initialSteps(['a', 'b', 'c']);
    expect(stepsPct(steps)).toBe(0);
    steps = updateStep(steps, 'a', { status: 'done' });
    expect(stepsPct(steps)).toBe(33);
    steps = updateStep(updateStep(steps, 'b', { status: 'done' }), 'c', { status: 'done' });
    expect(stepsPct(steps)).toBe(100);
  });
});
