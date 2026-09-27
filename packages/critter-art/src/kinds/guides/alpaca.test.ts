import { describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { ALL_POSES, buildBothOps, fixtureOptions } from '../design-kind-fixture';
import { alpaca } from './alpaca';

describe('alpaca', () => {
  const { K } = loadDesignDoodleKit();
  const designAlpaca = K['alpaca'];
  if (!designAlpaca) throw new Error('design/doodles.js no longer exports K.alpaca');

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes open', (pose) => {
    const options = fixtureOptions({ pose });
    const { ours, design } = buildBothOps(alpaca, designAlpaca, 55, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it.each(ALL_POSES)('matches the design op sequence for pose=%s, eyes closed', (pose) => {
    const options = fixtureOptions({ pose, closed: true });
    const { ours, design } = buildBothOps(alpaca, designAlpaca, 8, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('matches with a full custom palette including the stripe slot', () => {
    const options = fixtureOptions({
      fill: '#fff1d6',
      belly: '#fffaf0',
      spot: '#ff5fa8',
      stripe: '#ffd84a',
    });
    const { ours, design } = buildBothOps(alpaca, designAlpaca, 7, '#12100e', options);
    expect(ours).toEqual(design);
  });
});
