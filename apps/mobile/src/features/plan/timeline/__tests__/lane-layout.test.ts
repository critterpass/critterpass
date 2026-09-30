/**
 * Lanes: overlapping items sit side by side with the main lane first and an attendee subset in a
 * steady column, while items that don't overlap stay full width; the axis stretches to whole
 * hours around early and late items.
 */
import { describe, expect, it } from '@jest/globals';

import { axisFor, labelHours } from '../geometry';
import { layoutLanes } from '../lane-layout';

const h = (hours: number) => hours * 60;

describe('lane layout', () => {
  it('keeps non-overlapping items full width', () => {
    const placed = layoutLanes([
      { id: 'terraces', start: h(7), end: h(11), lane: null },
      { id: 'lunch', start: h(11.5), end: h(12.75), lane: null },
    ]);
    expect(placed.get('terraces')).toEqual({ column: 0, columns: 1 });
    expect(placed.get('lunch')).toEqual({ column: 0, columns: 1 });
  });

  it('puts an attendee subset beside the main lane while they overlap', () => {
    const placed = layoutLanes([
      { id: 'spa', start: h(15.5), end: h(17.75), lane: 'maya-rin' },
      { id: 'walk', start: h(17), end: h(18), lane: null },
      { id: 'dinner', start: h(19.5), end: h(21), lane: null },
    ]);
    expect(placed.get('walk')).toEqual({ column: 0, columns: 2 });
    expect(placed.get('spa')).toEqual({ column: 1, columns: 2 });
    expect(placed.get('dinner')).toEqual({ column: 0, columns: 1 });
  });

  it('gives a clash inside one lane its own column instead of stacking', () => {
    const placed = layoutLanes([
      { id: 'a', start: h(9), end: h(11), lane: null },
      { id: 'b', start: h(10), end: h(12), lane: null },
    ]);
    expect(placed.get('a')).toEqual({ column: 0, columns: 2 });
    expect(placed.get('b')).toEqual({ column: 1, columns: 2 });
  });

  it('drops an unused main column when only subsets overlap', () => {
    const placed = layoutLanes([
      { id: 'surf', start: h(8), end: h(10), lane: 'alex' },
      { id: 'yoga', start: h(8), end: h(9), lane: 'rin' },
    ]);
    expect(placed.get('surf')).toEqual({ column: 0, columns: 2 });
    expect(placed.get('yoga')).toEqual({ column: 1, columns: 2 });
  });
});

describe('axis', () => {
  it('runs 07–19 by default and stretches past midnight for an early pickup', () => {
    expect(axisFor([{ start: h(9), end: h(10) }])).toEqual({ start: h(7), end: h(19) });
    const late = axisFor([
      { start: h(3.5), end: h(4.5) },
      { start: h(24 + 3.5), end: h(24 + 4) },
    ]);
    expect(late).toEqual({ start: h(3), end: h(29) });
    expect(labelHours(late)[0]).toBe(3);
  });
});
