import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { BakeTarget } from '../manifest';
import { runPool } from '../pool';
import { expandManifest } from '../render-job';
import { buildAndroidResFiles, writeAndroidRes } from './android-res';

function target(overrides: Partial<BakeTarget> & Pick<BakeTarget, 'kind'>): BakeTarget {
  return {
    forms: ['common'],
    poses: ['idle'],
    variants: ['color'],
    sizesPt: [48],
    scales: [2, 3],
    crop: 'none',
    format: 'png',
    out: 'out',
    ...overrides,
  };
}

describe('buildAndroidResFiles', () => {
  it('maps each scale to its density bucket with a lowercase snake_case drawable name', async () => {
    const jobs = expandManifest([target({ kind: 'gecko' })]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    const files = buildAndroidResFiles(jobs, outputs);

    expect(files.map((f) => f.relativePath).sort()).toEqual(
      [
        'drawable-xhdpi/critter_gecko_common_idle_color_48pt.png',
        'drawable-xxhdpi/critter_gecko_common_idle_color_48pt.png',
      ].sort(),
    );
  });

  it('skips a scale with no defined Android density bucket', async () => {
    const jobs = expandManifest([target({ kind: 'gecko', scales: [2, 2.75] })]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    const files = buildAndroidResFiles(jobs, outputs);
    expect(files).toHaveLength(1);
  });
});

describe('writeAndroidRes', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes every file under its density directory', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-android-res-'));
    const jobs = expandManifest([target({ kind: 'gecko' })]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    const files = buildAndroidResFiles(jobs, outputs);

    writeAndroidRes(dir, files);

    for (const file of files) {
      expect(existsSync(join(dir, file.relativePath))).toBe(true);
    }
  });
});
