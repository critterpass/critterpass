import { describe, expect, it } from 'vitest';

import {
  adsrValue,
  applyAdsr,
  applyEnvelopeCurve,
  envelopeValueAt,
  exponentialDecay,
} from './envelope';

describe('envelope', () => {
  const spec = {
    attackSec: 0.1,
    decaySec: 0.1,
    sustainLevel: 0.5,
    releaseSec: 0.2,
    durationSec: 1,
  };

  it('adsrValue ramps 0 -> 1 over attack', () => {
    expect(adsrValue(spec, 0)).toBeCloseTo(0);
    expect(adsrValue(spec, 0.05)).toBeCloseTo(0.5, 1);
    expect(adsrValue(spec, 0.1)).toBeCloseTo(1, 1);
  });

  it('adsrValue decays to sustain then holds', () => {
    expect(adsrValue(spec, 0.2)).toBeCloseTo(0.5, 1);
    expect(adsrValue(spec, 0.6)).toBeCloseTo(0.5, 1);
  });

  it('adsrValue releases to 0 by end of duration', () => {
    expect(adsrValue(spec, 1)).toBeCloseTo(0, 1);
  });

  it('applyAdsr scales a buffer with the same shape', () => {
    const buf = new Float32Array(48000).fill(1);
    applyAdsr(buf, spec, 48000);
    expect(buf[0]).toBeCloseTo(0, 1);
    expect(buf[47999]).toBeCloseTo(0, 1);
  });

  it('envelopeValueAt interpolates breakpoints and clamps at the edges', () => {
    const points: [number, number][] = [
      [0, 0],
      [0.1, 1],
      [0.3, 0],
    ];
    expect(envelopeValueAt(points, -1)).toBeCloseTo(0);
    expect(envelopeValueAt(points, 0.05)).toBeCloseTo(0.5);
    expect(envelopeValueAt(points, 10)).toBeCloseTo(0);
  });

  it('applyEnvelopeCurve applies the breakpoint shape to a buffer', () => {
    const buf = new Float32Array(10).fill(1);
    applyEnvelopeCurve(
      buf,
      [
        [0, 1],
        [buf.length / 48000, 0],
      ],
      48000,
    );
    expect(buf[0]).toBeCloseTo(1);
    expect(buf[9]).toBeLessThan(buf[0] as number);
  });

  it('exponentialDecay decays toward 0 and starts at 1', () => {
    expect(exponentialDecay(0, 0.1)).toBeCloseTo(1);
    expect(exponentialDecay(0.5, 0.1)).toBeLessThan(0.01);
  });
});
