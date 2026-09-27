import { describe, expect, it } from 'vitest';

import { createOpBuilder, F, W } from './ops';

const SQUARE = [
  [10, 10],
  [90, 10],
  [90, 90],
  [10, 90],
] as const;

describe('createOpBuilder', () => {
  it('consumes a seed for line/stroke/wash only, in call order', () => {
    const { sink, ops } = createOpBuilder(7, '#221e19');
    sink.wash(SQUARE, '#f00'); // seed 7
    sink.fill(SQUARE, '#0f0'); // no seed
    sink.dot(50, 50, 4, '#00f'); // no seed
    sink.line(SQUARE, { close: true }); // seed 8
    sink.stroke(SQUARE, '#fff', 3); // seed 9

    expect(ops.map((op) => op.t)).toEqual(['wash', 'fill', 'fill', 'line', 'under']);
    expect(ops[0]?.t === 'wash' && ops[0].seed).toBe(7);
    expect(ops[3]?.t === 'line' && ops[3].seed).toBe(8);
    expect(ops[4]?.t === 'under' && ops[4].seed).toBe(9);
  });

  it('defaults line colour to ink unless overridden', () => {
    const { sink, ops } = createOpBuilder(1, '#221e19');
    sink.line(SQUARE);
    sink.line(SQUARE, { color: '#ff5fa8' });
    expect(ops[0]?.t === 'line' && ops[0].color).toBe('#221e19');
    expect(ops[1]?.t === 'line' && ops[1].color).toBe('#ff5fa8');
  });

  it('tapers open lines by default and never tapers closed lines', () => {
    const { sink, ops } = createOpBuilder(1, '#221e19');
    sink.line(SQUARE); // open, default -> taper true
    sink.line(SQUARE, { taper: false }); // open, explicit false -> taper false
    sink.line(SQUARE, { close: true }); // closed -> taper false regardless
    sink.line(SQUARE, { close: true, taper: true }); // closed wins over explicit taper
    expect(ops.map((op) => op.t === 'line' && op.taper)).toEqual([true, false, false, false]);
  });

  it('under-strokes always taper and are never closed', () => {
    const { sink, ops } = createOpBuilder(1, '#221e19');
    sink.stroke(SQUARE, '#f00', 4);
    expect(ops[0]?.t).toBe('under');
  });

  it('dot builds a 10-point ellipse fill at the given alpha (default 1)', () => {
    const { sink, ops } = createOpBuilder(1, '#221e19');
    sink.dot(20, 30, 5, '#ff7fa8');
    sink.dot(20, 30, 5, '#ff7fa8', 0.5);
    expect(ops[0]?.t === 'fill' && ops[0].points.length).toBe(10);
    expect(ops[0]?.t === 'fill' && ops[0].alpha).toBe(1);
    expect(ops[1]?.t === 'fill' && ops[1].alpha).toBe(0.5);
  });

  it('W washes then outlines; F fills then outlines', () => {
    const { sink, ops } = createOpBuilder(1, '#221e19');
    W(sink, SQUARE, '#54d6a4');
    F(sink, SQUARE, '#ffd84a');
    expect(ops.map((op) => op.t)).toEqual(['wash', 'line', 'fill', 'line']);
    expect(ops[1]?.t === 'line' && ops[1].closed).toBe(true);
    expect(ops[3]?.t === 'line' && ops[3].closed).toBe(true);
  });
});
