import { describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { ALL_POSES, buildBothOps, fixtureOptions } from '../design-kind-fixture';
import { axolotl } from './axolotl';

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
});
