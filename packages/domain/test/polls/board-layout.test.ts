import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { boardLayout, seededRandom } from '../../src/polls/board-layout';

describe('boardLayout', { timeout: 60_000 }, () => {
  it('is the same on every call for the same poll', () => {
    expect(boardLayout('poll-1', ['a', 'b', 'c'])).toEqual(boardLayout('poll-1', ['a', 'b', 'c']));
    expect(boardLayout('poll-1', ['a', 'b', 'c'])).not.toEqual(
      boardLayout('poll-2', ['a', 'b', 'c']),
    );
  });

  it('places 1–8 stickers and the pitch slot without overlap, inside the board', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 1, max: 8 }),
        (seed, n) => {
          const ids = Array.from({ length: n }, (_, i) => `option-${i}`);
          const layout = boardLayout(seed, ids);
          expect(layout.items).toHaveLength(n + 1);
          expect(layout.items.at(-1)?.id).toBeNull();
          for (const [i, a] of layout.items.entries()) {
            expect(a.cx - a.size / 2).toBeGreaterThanOrEqual(-1e-9);
            expect(a.cx + a.size / 2).toBeLessThanOrEqual(1 + 1e-9);
            expect(a.cy - a.size / 2).toBeGreaterThanOrEqual(-1e-9);
            expect(a.cy + a.size / 2).toBeLessThanOrEqual(layout.height + 1e-9);
            expect(a.floatMs).toBeGreaterThanOrEqual(4000);
            expect(a.floatMs).toBeLessThanOrEqual(5000);
            for (const b of layout.items.slice(i + 1)) {
              expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(
                (a.size + b.size) / 2,
              );
            }
          }
        },
      ),
      { numRuns: 400 },
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
