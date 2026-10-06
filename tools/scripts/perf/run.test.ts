import { describe, expect, it } from 'vitest';

import { median, parseAmStart, parseMsLines } from './cold-start';
import { parseGfxinfo } from './frames';
import { scalarFrom } from './api-p95';
import { report, type Measurement } from './run';

describe('cold start', () => {
  it('takes the median TotalTime of several launches', () => {
    const output = ['Status: ok', 'TotalTime: 1300', 'TotalTime: 900', 'TotalTime: 1100'].join(
      '\n',
    );
    expect(median(parseAmStart(output))).toBe(1100);
    expect(median(parseMsLines('700\n\n820\n760\n780\n'))).toBe(770);
    expect(median([])).toBeUndefined();
  });
});

describe('frames', () => {
  it('turns the 90th percentile frame time into a rate', () => {
    const gfx = 'Total frames rendered: 1200\nJanky frames: 30 (2.50%)\n90th percentile: 20ms\n';
    expect(parseGfxinfo(gfx)).toEqual({ frames: 1200, jankyPercent: 2.5, p90Ms: 20, fps: 50 });
    expect(parseGfxinfo('Total frames rendered: 0\n90th percentile: 5ms')).toBeUndefined();
  });
});

describe('grafana values', () => {
  it('reads an instant value and treats NaN or empty as missing', () => {
    expect(scalarFrom({ data: { result: [{ value: [0, '212.5'] }] } })).toBe(212.5);
    expect(scalarFrom({ data: { result: [{ value: [0, 'NaN'] }] } })).toBeUndefined();
    expect(scalarFrom({ data: { result: [] } })).toBeUndefined();
  });
});

describe('report', () => {
  const m = (value: number | undefined, kind: 'max' | 'min' = 'max'): Measurement => ({
    metric: 'x',
    value,
    budget: 100,
    kind,
    unit: 'ms',
  });

  it('fails a breach in either direction and passes values on the budget', () => {
    expect(report([m(100), m(100, 'min')], false).failed).toBe(false);
    expect(report([m(101)], false).failed).toBe(true);
    expect(report([m(99, 'min')], false).failed).toBe(true);
  });

  it('skips a metric without input unless strict', () => {
    expect(report([m(undefined)], false).failed).toBe(false);
    expect(report([m(undefined)], true).failed).toBe(true);
  });
});
