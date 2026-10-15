import { describe, expect, it } from '@jest/globals';

import { patternFor } from '../no-photo';

describe('patternFor', () => {
  it('scatters the same pattern for the same place, and a different one for another', () => {
    const one = patternFor(320, 200, 'place-1');
    expect(patternFor(320, 200, 'place-1')).toEqual(one);
    expect(patternFor(320, 200, 'place-2')).not.toEqual(one);
  });

  it('covers the whole box with doodles sized to it', () => {
    const items = patternFor(320, 200, 'place-1');
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...items.map((item) => item.x + item.side))).toBeGreaterThan(280);
    expect(Math.max(...items.map((item) => item.y + item.side))).toBeGreaterThan(160);
    for (const item of items) expect(item.side).toBe(40);
  });
});
