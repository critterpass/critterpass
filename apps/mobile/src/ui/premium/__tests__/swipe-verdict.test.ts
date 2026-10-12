import { describe, expect, it } from '@jest/globals';

import { swipeVerdict } from '../motion/swipe-verdict';

describe('swipeVerdict', () => {
  const width = 300;

  it('springs back from a short, slow drag', () => {
    expect(swipeVerdict(60, 200, width)).toBeNull();
    expect(swipeVerdict(-60, -200, width)).toBeNull();
  });

  it('votes in past a third of the card to the right, out to the left', () => {
    expect(swipeVerdict(100, 0, width)).toBe('in');
    expect(swipeVerdict(-100, 0, width)).toBe('out');
  });

  it('commits a fast flick whatever the distance, in its own direction', () => {
    expect(swipeVerdict(20, 900, width)).toBe('in');
    expect(swipeVerdict(-20, -900, width)).toBe('out');
  });

  it('never commits a flick that runs against the drag', () => {
    expect(swipeVerdict(40, -1200, width)).toBeNull();
  });

  it('needs a measured card before distance alone can commit', () => {
    expect(swipeVerdict(100, 0, 0)).toBeNull();
  });
});
