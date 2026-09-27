import { describe, expect, it } from 'vitest';

import {
  applyFade,
  applyGain,
  concat,
  createBuffer,
  dbToLinear,
  dcOffset,
  linearToDb,
  mixInto,
  peakAbs,
  removeDcOffset,
  trimOrPad,
} from './signal';

describe('signal', () => {
  it('createBuffer allocates the right length', () => {
    expect(createBuffer(1, 48000).length).toBe(48000);
    expect(createBuffer(0.5, 48000).length).toBe(24000);
  });

  it('mixInto sums with gain and offset, clipping out-of-range writes', () => {
    const dest = new Float32Array(4);
    mixInto(dest, new Float32Array([1, 1]), 0.5, 3);
    expect(Array.from(dest)).toEqual([0, 0, 0, 0.5]);
  });

  it('applyGain scales in place', () => {
    const buf = new Float32Array([1, -1, 0.5]);
    applyGain(buf, 2);
    expect(Array.from(buf)).toEqual([2, -2, 1]);
  });

  it('applyFade ramps edges to zero', () => {
    const buf = new Float32Array(10).fill(1);
    applyFade(buf, 4, 4);
    expect(buf[0]).toBe(0);
    expect(buf[9]).toBe(0);
    expect(buf[5]).toBe(1);
  });

  it('peakAbs finds the largest magnitude', () => {
    expect(peakAbs(new Float32Array([0.1, -0.9, 0.3]))).toBeCloseTo(0.9);
  });

  it('dcOffset and removeDcOffset', () => {
    const buf = new Float32Array([1, 1, 1, 1]);
    expect(dcOffset(buf)).toBeCloseTo(1);
    removeDcOffset(buf);
    expect(dcOffset(buf)).toBeCloseTo(0);
  });

  it('concat joins buffers in order', () => {
    const out = concat([new Float32Array([1, 2]), new Float32Array([3])]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('trimOrPad truncates and zero-pads', () => {
    expect(Array.from(trimOrPad(new Float32Array([1, 2, 3]), 2))).toEqual([1, 2]);
    expect(Array.from(trimOrPad(new Float32Array([1, 2]), 4))).toEqual([1, 2, 0, 0]);
  });

  it('dB conversions round-trip', () => {
    expect(dbToLinear(0)).toBeCloseTo(1);
    expect(linearToDb(1)).toBeCloseTo(0);
    expect(linearToDb(dbToLinear(-6))).toBeCloseTo(-6, 5);
  });
});
