import { describe, expect, it } from 'vitest';

import { boardLayout, seededRandom } from '../../src/polls/board-layout';

describe('boardLayout', { timeout: 60_000 }, () => {
  it('is the same on every call for the same poll', () => {
    expect(boardLayout('poll-1', ['a', 'b', 'c'])).toEqual(boardLayout('poll-1', ['a', 'b', 'c']));
    expect(boardLayout('poll-1', ['a', 'b', 'c'])).not.toEqual(
      boardLayout('poll-2', ['a', 'b', 'c']),
    );
  });

  it('keeps at most eight candidates', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `o${i}`);
    expect(boardLayout('x', ids).items).toHaveLength(9);
  });

  it('draws the same sequence on every platform', () => {
    const random = seededRandom('poll');
    expect([random(), random()]).toEqual([expect.any(Number), expect.any(Number)]);
    const again = seededRandom('poll');
    const first = again();
    expect(seededRandom('poll')()).toBe(first);
  });
});
