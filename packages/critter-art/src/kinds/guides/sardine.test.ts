import { describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { ALL_POSES, buildBothOps, fixtureOptions } from '../design-kind-fixture';
import { sardine } from './sardine';

describe('sardine', () => {
  const { K } = loadDesignDoodleKit();
  const designSardine = K['sardine'];
  if (!designSardine) throw new Error('design/doodles.js no longer exports K.sardine');

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes open', (pose) => {
    const options = fixtureOptions({ pose });
    const { ours, design } = buildBothOps(sardine, designSardine, 16, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes closed', (pose) => {
    const options = fixtureOptions({ pose, closed: true });
    const { ours, design } = buildBothOps(sardine, designSardine, 24, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('matches with a full custom palette', () => {
    const options = fixtureOptions({ fill: '#9fe0ee', spot: '#3d6fe0', belly: '#f2fbff' });
    const { ours, design } = buildBothOps(sardine, designSardine, 7, '#12100e', options);
    expect(ours).toEqual(design);
  });
});
