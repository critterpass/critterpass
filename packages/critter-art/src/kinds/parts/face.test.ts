import { describe, expect, it } from 'vitest';

import { createOpBuilder } from '../../core/ops';
import { dotEyes } from './face';

const OPTIONS = { eye: '#fffdf6', pupil: '#221e19' };
// A single point isolates the per-point seed imbalance to exactly 1; dotEyes loops per point, so
// N points would multiply it by N.
const POINTS = [[40, 40]] as const;

/** Probes how many seeds a call consumed by comparing the seed of an immediately-following line op. */
function probeSeedAfter(run: (sink: ReturnType<typeof createOpBuilder>['sink']) => void): number {
  const { sink, ops } = createOpBuilder(7, '#221e19');
  run(sink);
  sink.line([
    [0, 0],
    [1, 1],
  ]);
  const probe = ops.at(-1);
  if (!probe || probe.t !== 'line') throw new Error('probe line op missing');
  return probe.seed;
}

describe('dotEyes stable seed mode', () => {
  it('design mode (default) reproduces the seed-count mismatch: closed consumes one more seed than open', () => {
    const openSeed = probeSeedAfter((sink) =>
      dotEyes(sink, { ...OPTIONS, closed: false }, POINTS, 3),
    );
    const closedSeed = probeSeedAfter((sink) =>
      dotEyes(sink, { ...OPTIONS, closed: true }, POINTS, 3),
    );
    expect(closedSeed).toBe(openSeed + 1);
  });

  it('stable mode reserves the missing seed so open and closed consume the same number of seeds', () => {
    const openSeed = probeSeedAfter((sink) =>
      dotEyes(sink, { ...OPTIONS, closed: false, seedMode: 'stable' }, POINTS, 3),
    );
    const closedSeed = probeSeedAfter((sink) =>
      dotEyes(sink, { ...OPTIONS, closed: true, seedMode: 'stable' }, POINTS, 3),
    );
    expect(closedSeed).toBe(openSeed);
  });
});
