import { loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import type { BakeTarget } from './manifest';
import { expandManifest } from './render-job';
import { runPool } from './pool';

function target(overrides: Partial<BakeTarget> & Pick<BakeTarget, 'kind'>): BakeTarget {
  return {
    forms: ['common'],
    poses: ['idle'],
    variants: ['color'],
    sizesPt: [48],
    scales: [2],
    crop: 'none',
    format: 'png',
    out: 'out',
    ...overrides,
  };
}

describe('runPool', () => {
  it('renders every job across a small worker pool and returns decodable images', async () => {
    const jobs = expandManifest([
      target({ kind: 'gecko', poses: ['idle', 'cheer'], sizesPt: [48, 96] }),
    ]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    expect(outputs).toHaveLength(jobs.length);

    const outPaths = new Set(outputs.map((o) => o.outPath));
    expect(outPaths.size).toBe(jobs.length);

    for (const output of outputs) {
      const image = await loadImage(Buffer.from(output.bytes));
      expect(image.width).toBeGreaterThan(0);
    }
  }, 20_000);

  it('returns an empty array for an empty job list without spawning workers', async () => {
    const outputs = await runPool([], { concurrency: 2 });
    expect(outputs).toEqual([]);
  });
});
