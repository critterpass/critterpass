import { describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { ALL_POSES, buildBothOps, fixtureOptions } from '../design-kind-fixture';
import { tanuki } from './tanuki';

describe('tanuki', () => {
  const { K } = loadDesignDoodleKit();
  const designTanuki = K['tanuki'];
  if (!designTanuki) throw new Error('design/doodles.js no longer exports K.tanuki');

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes open', (pose) => {
    const options = fixtureOptions({ pose });
    const { ours, design } = buildBothOps(tanuki, designTanuki, 11, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes closed', (pose) => {
    const options = fixtureOptions({ pose, closed: true });
    const { ours, design } = buildBothOps(tanuki, designTanuki, 61, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('matches with a full custom palette including the leaf slot', () => {
    const options = fixtureOptions({
      fill: '#ff9a4d',
      spot: '#c4623e',
      belly: '#fff1dc',
      leaf: '#6cc46a',
      pose: 'cheer',
    });
    const { ours, design } = buildBothOps(tanuki, designTanuki, 41, '#12100e', options);
    expect(ours).toEqual(design);
  });
});
