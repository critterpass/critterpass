import { describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { ALL_POSES, buildBothOps, fixtureOptions } from '../design-kind-fixture';
import { puffin } from './puffin';

describe('puffin', () => {
  const { K } = loadDesignDoodleKit();
  const designPuffin = K['puffin'];
  if (!designPuffin) throw new Error('design/doodles.js no longer exports K.puffin');

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes open', (pose) => {
    const options = fixtureOptions({ pose });
    const { ours, design } = buildBothOps(puffin, designPuffin, 18, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes closed', (pose) => {
    const options = fixtureOptions({ pose, closed: true });
    const { ours, design } = buildBothOps(puffin, designPuffin, 58, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('matches with a full custom palette including beak2', () => {
    const options = fixtureOptions({
      fill: '#3d6fe0',
      belly: '#fff6e6',
      spot: '#ff9a4d',
      beak2: '#ffd84a',
      pose: 'wave',
    });
    const { ours, design } = buildBothOps(puffin, designPuffin, 46, '#12100e', options);
    expect(ours).toEqual(design);
  });
});
