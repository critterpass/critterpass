import { describe, expect, it } from '@jest/globals';

import { classifyQuality, QUALITY_THRESHOLDS } from '../src/quality';
import type { OcrQualitySignals } from '../src/types';

const clean: OcrQualitySignals = { blur: 400, glare: 0.001, curvature: 0.6, clipped: 0 };

describe('classifyQuality', () => {
  it('passes a sharp, flat, evenly lit page that fits the frame', () => {
    expect(classifyQuality(clean)).toBeNull();
  });

  it('names each problem at its threshold', () => {
    const t = QUALITY_THRESHOLDS;
    expect(classifyQuality({ ...clean, curvature: t.curvature })).toBe('crumpled');
    expect(classifyQuality({ ...clean, curvature: t.curvature - 0.01 })).toBeNull();
    expect(classifyQuality({ ...clean, blur: t.blur - 0.01 })).toBe('blurry');
    expect(classifyQuality({ ...clean, blur: t.blur })).toBeNull();
    expect(classifyQuality({ ...clean, glare: t.glare })).toBe('glare');
    expect(classifyQuality({ ...clean, glare: t.glare - 0.001 })).toBeNull();
    expect(classifyQuality({ ...clean, clipped: t.clipped })).toBe('cut_off');
    expect(classifyQuality({ ...clean, clipped: t.clipped - 0.01 })).toBeNull();
  });

  it('names the problem a retake fixes first when several apply', () => {
    const all = { blur: 1, glare: 0.5, curvature: 12, clipped: 0.5 };
    expect(classifyQuality(all)).toBe('crumpled');
    expect(classifyQuality({ ...all, curvature: 0 })).toBe('blurry');
    expect(classifyQuality({ ...all, curvature: 0, blur: 500 })).toBe('glare');
    expect(classifyQuality({ ...all, curvature: 0, blur: 500, glare: 0 })).toBe('cut_off');
  });

  it('never raises an issue from a signal that was not measured', () => {
    expect(
      classifyQuality({
        blur: Number.NaN,
        glare: Number.NaN,
        curvature: Number.NaN,
        clipped: Number.NaN,
      }),
    ).toBeNull();
    expect(classifyQuality({ ...clean, curvature: Number.POSITIVE_INFINITY })).toBeNull();
  });
});
