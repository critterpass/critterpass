import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { BakeTarget } from '../manifest';
import { expandManifest } from '../render-job';
import { buildAppGroupKeyIndex, writeAppGroupKeyIndex } from './app-group-keys';
import { imagesetName } from './xcassets';

function target(overrides: Partial<BakeTarget> & Pick<BakeTarget, 'kind'>): BakeTarget {
  return {
    forms: ['common'],
    poses: ['idle'],
    variants: ['color'],
    sizesPt: [48],
    scales: [1, 2, 3],
    crop: 'none',
    format: 'png',
    out: 'out',
    ...overrides,
  };
}

describe('buildAppGroupKeyIndex', () => {
  it('keys @2x/@3x jobs as "<kind>-<form>-<pose>-<mode>@<scale>x" mapped to the bundled imageset name', () => {
    const jobs = expandManifest([target({ kind: 'gecko' })]);
    const index = buildAppGroupKeyIndex(jobs);

    expect(index).toEqual({
      'gecko-common-idle-color@2x': imagesetName(jobs[1]!),
      'gecko-common-idle-color@3x': imagesetName(jobs[2]!),
    });
  });

  it('excludes 1x jobs (no bundled imageset variant for them)', () => {
    const jobs = expandManifest([target({ kind: 'gecko' })]);
    const index = buildAppGroupKeyIndex(jobs);
    expect(Object.keys(index).some((key) => key.endsWith('@1x'))).toBe(false);
  });
});

describe('writeAppGroupKeyIndex', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes a sorted JSON index', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-appgroup-'));
    const destPath = join(dir, 'app-group-keys.json');
    writeAppGroupKeyIndex(destPath, { b: 'two', a: 'one' });

    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, 'utf8')).toBe(
      `${JSON.stringify({ a: 'one', b: 'two' }, null, 2)}\n`,
    );
  });
});
