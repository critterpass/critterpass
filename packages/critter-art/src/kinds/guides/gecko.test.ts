import { describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { ALL_POSES, buildBothOps, fixtureOptions } from '../design-kind-fixture';
import { gecko } from './gecko';

describe('gecko', () => {
  const { K } = loadDesignDoodleKit();
  const designGecko = K['gecko'];
  if (!designGecko) throw new Error('design/doodles.js no longer exports K.gecko');

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes open', (pose) => {
    const options = fixtureOptions({ pose, eye: '#fffdf6', pupil: '#221e19' });
    const { ours, design } = buildBothOps(gecko, designGecko, 7, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes closed', (pose) => {
    const options = fixtureOptions({ pose, closed: true });
    const { ours, design } = buildBothOps(gecko, designGecko, 205, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('matches with a full custom palette', () => {
    const options = fixtureOptions({
      fill: '#54d6a4',
      spot: '#2e9a74',
      accent: '#ff9a4d',
      eye: '#fff6e6',
      pupil: '#12100e',
      pose: 'cheer',
    });
    const { ours, design } = buildBothOps(gecko, designGecko, 41, '#12100e', options);
    expect(ours).toEqual(design);
  });
});
