import { describe, expect, it } from 'vitest';

import { percentile, summarize, timeSequential } from './stats';

describe('percentile', () => {
  it('returns 0 for an empty sample set', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('picks the nearest-rank value for p50/p95/p99', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 95)).toBe(95);
    expect(percentile(samples, 99)).toBe(99);
  });

  it('does not mutate the input array', () => {
    const samples = [5, 1, 3];
    percentile(samples, 50);
    expect(samples).toEqual([5, 1, 3]);
  });
});

describe('summarize', () => {
  it('reports count, mean, percentiles and max', () => {
    const summary = summarize([10, 20, 30, 40]);
    expect(summary.count).toBe(4);
    expect(summary.meanMs).toBe(25);
    expect(summary.maxMs).toBe(40);
    expect(summary.p50Ms).toBe(20);
  });

  it('handles an empty sample set without dividing by zero', () => {
    expect(summarize([])).toEqual({ count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 });
  });
});

describe('timeSequential', () => {
  it('runs the callback the requested number of times and returns one sample each', async () => {
    let calls = 0;
    const samples = await timeSequential(5, async () => {
      calls += 1;
      await Promise.resolve();
    });
    expect(calls).toBe(5);
    expect(samples).toHaveLength(5);
    for (const sample of samples) expect(sample).toBeGreaterThanOrEqual(0);
  });
});
