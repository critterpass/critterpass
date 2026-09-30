/**
 * Reflow: blocks in the moved block's lane get out of its way keeping their length (later ones
 * down, earlier ones up, cascading), other lanes stay put, and a move that would push a booked
 * block or run out of day is refused.
 */
import { describe, expect, it } from '@jest/globals';

import { reflow, type ReflowBlock } from '../reflow';

const h = (hours: number) => hours * 60;
const DAY = { min: h(7), max: h(22) };

function block(
  id: string,
  start: number,
  end: number,
  extra: Partial<ReflowBlock> = {},
): ReflowBlock {
  return { id, start: h(start), end: h(end), lane: null, fixed: false, ...extra };
}

describe('reflow', () => {
  const day = [
    block('walk', 14, 15),
    block('coffee', 15, 15.5),
    block('market', 15.5, 16.5),
    block('spa', 14, 16, { lane: 'maya-rin' }),
    block('dinner', 19.5, 21, { fixed: true }),
  ];

  it('pushes later blocks down in a cascade and leaves other lanes alone', () => {
    const result = reflow(day, { id: 'walk', start: h(14.75), lane: null }, DAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.fromEntries(result.starts)).toEqual({
      walk: h(14.75),
      coffee: h(15.75),
      market: h(16.25),
    });
  });

  it('pushes earlier blocks up when the move lands on them', () => {
    const result = reflow(day, { id: 'market', start: h(15.25), lane: null }, DAY);
    expect(result.ok && Object.fromEntries(result.starts)).toEqual({
      market: h(15.25),
      coffee: h(14.75),
      walk: h(13.75),
    });
  });

  it('refuses to push a booked block and to move one', () => {
    expect(reflow(day, { id: 'market', start: h(19), lane: null }, DAY)).toEqual({
      ok: false,
      reason: 'fixed',
      blockedBy: 'dinner',
    });
    expect(reflow(day, { id: 'dinner', start: h(20), lane: null }, DAY)).toMatchObject({
      ok: false,
      reason: 'fixed',
    });
  });

  it('refuses a push past the end of the day', () => {
    const late = [block('a', 20, 21), block('b', 21, 22)];
    expect(reflow(late, { id: 'a', start: h(20.5), lane: null }, DAY)).toEqual({
      ok: false,
      reason: 'no_room',
      blockedBy: 'b',
    });
  });
});
