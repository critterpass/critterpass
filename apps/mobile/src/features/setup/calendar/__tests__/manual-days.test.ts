/**
 * Painting days by hand: a tool paints a day its state, painting a day already in that state
 * clears it, a drag keeps the mode its first day set (paint or clear) over every day it crosses,
 * and other days keep their marks.
 */
import { describe, expect, it } from '@jest/globals';

import { datesBetween, paintMode, painted, type ManualMarks } from '../manual-days';

const MARKS: ManualMarks = { '2026-10-05': 'free', '2026-10-06': 'busy' };

describe('painting days', () => {
  it('paints a day the tool’s state, over another state too', () => {
    expect(paintMode(MARKS, '2026-10-07', 'maybe')).toBe('set');
    expect(painted(MARKS, ['2026-10-07'], 'maybe', 'set')).toEqual({
      ...MARKS,
      '2026-10-07': 'maybe',
    });
    expect(paintMode(MARKS, '2026-10-06', 'free')).toBe('set');
    expect(painted(MARKS, ['2026-10-06'], 'free', 'set')['2026-10-06']).toBe('free');
  });

  it('clears a day already in the tool’s state', () => {
    expect(paintMode(MARKS, '2026-10-05', 'free')).toBe('clear');
    expect(painted(MARKS, ['2026-10-05'], 'free', 'clear')).toEqual({ '2026-10-06': 'busy' });
  });

  it('drags one mode over every day crossed, in either direction', () => {
    expect(datesBetween('2026-10-08', '2026-10-05')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
    expect(datesBetween('2026-10-30', '2026-11-02')).toHaveLength(4);
    const stroke = datesBetween('2026-10-05', '2026-10-07');
    expect(painted(MARKS, stroke, 'busy', paintMode(MARKS, '2026-10-05', 'busy'))).toEqual({
      '2026-10-05': 'busy',
      '2026-10-06': 'busy',
      '2026-10-07': 'busy',
    });
    // A stroke that starts on a Busy day with Busy clears, the Free day it crosses included.
    expect(painted(MARKS, stroke, 'busy', paintMode(MARKS, '2026-10-06', 'busy'))).toEqual({});
  });
});
