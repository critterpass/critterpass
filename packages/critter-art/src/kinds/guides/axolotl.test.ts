import { describe, expect, it } from 'vitest';

import { createOpBuilder } from '../../core/ops';
import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { ALL_POSES, buildBothOps, fixtureOptions } from '../design-kind-fixture';
import type { KindDrawOptions } from '../registry';
import { axolotl } from './axolotl';

/** Probes how many seeds a call consumed by comparing the seed of an immediately-following line op. */
function probeSeedAfter(options: KindDrawOptions): number {
  const { sink, ops } = createOpBuilder(7, '#221e19');
  axolotl(sink, options);
  sink.line([
    [0, 0],
    [1, 1],
  ]);
  const probe = ops.at(-1);
  if (!probe || probe.t !== 'line') throw new Error('probe line op missing');
  return probe.seed;
}

describe('axolotl', () => {
  const { K } = loadDesignDoodleKit();
  const designAxolotl = K['axolotl'];
  if (!designAxolotl) throw new Error('design/doodles.js no longer exports K.axolotl');

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes open', (pose) => {
    const options = fixtureOptions({ pose });
    const { ours, design } = buildBothOps(axolotl, designAxolotl, 14, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes closed', (pose) => {
    const options = fixtureOptions({ pose, closed: true });
    const { ours, design } = buildBothOps(axolotl, designAxolotl, 7, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('matches with a full custom palette', () => {
    const options = fixtureOptions({
      fill: '#ff9cc8',
      spot: '#ff4f9a',
      belly: '#ffe0ee',
      pose: 'cheer',
    });
    const { ours, design } = buildBothOps(axolotl, designAxolotl, 41, '#12100e', options);
    expect(ours).toEqual(design);
  });

  describe('stable seed mode', () => {
    const base = { ink: '#221e19', eye: '#fffdf6', pupil: '#221e19' };

    it('design mode (default) reproduces the mismatch: closed consumes one seed per eye more than open', () => {
      const openSeed = probeSeedAfter({ ...base, closed: false });
      const closedSeed = probeSeedAfter({ ...base, closed: true });
      expect(closedSeed).toBe(openSeed + 2); // axolotl draws 2 eyes
    });

    it('stable mode reserves the missing seed so open and closed consume the same number of seeds', () => {
      const openSeed = probeSeedAfter({ ...base, closed: false, seedMode: 'stable' });
      const closedSeed = probeSeedAfter({ ...base, closed: true, seedMode: 'stable' });
      expect(openSeed).toBe(closedSeed);
    });
  });
});
