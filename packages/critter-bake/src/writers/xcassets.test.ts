import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { expandManifest } from '../render-job';
import { runPool } from '../pool';
import type { BakeTarget } from '../manifest';
import { buildImagesets, imagesetName, writeXcassetCatalog } from './xcassets';

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

describe('buildImagesets', () => {
  it('groups @2x/@3x outputs of the same (kind, form, pose, variant, size) into one imageset', async () => {
    const jobs = expandManifest([target({ kind: 'gecko' })]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    const imagesets = buildImagesets(jobs, outputs);

    expect(imagesets).toHaveLength(1);
    expect(imagesets[0]?.name).toBe(imagesetName(jobs[0]!));
    expect(imagesets[0]?.variants.map((v) => v.scale).sort()).toEqual([2, 3]);
    expect(imagesets[0]?.template).toBe(false);
  });

  it('marks a mask-variant imageset as a template', async () => {
    const jobs = expandManifest([target({ kind: 'gecko', variants: ['mask'] })]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    const imagesets = buildImagesets(jobs, outputs);
    expect(imagesets[0]?.template).toBe(true);
  });

  it('skips a 1x job (every supported device is at least @2x)', async () => {
    const jobs = expandManifest([target({ kind: 'gecko', scales: [1, 2] })]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    const imagesets = buildImagesets(jobs, outputs);
    expect(imagesets[0]?.variants.map((v) => v.scale)).toEqual([2]);
  });
});

describe('writeXcassetCatalog', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes a root Contents.json and one .imageset per entry, each with its own Contents.json and PNGs', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-xcassets-'));
    const jobs = expandManifest([target({ kind: 'gecko', variants: ['color', 'mask'] })]);
    const outputs = await runPool(jobs, { concurrency: 2 });
    const imagesets = buildImagesets(jobs, outputs);

    const catalogDir = join(dir, 'CritterArt.xcassets');
    writeXcassetCatalog(catalogDir, imagesets);

    expect(existsSync(join(catalogDir, 'Contents.json'))).toBe(true);
    const rootContents = JSON.parse(readFileSync(join(catalogDir, 'Contents.json'), 'utf8')) as {
      info: unknown;
    };
    expect(rootContents.info).toEqual({ author: 'xcode', version: 1 });

    for (const imageset of imagesets) {
      const imagesetDir = join(catalogDir, `${imageset.name}.imageset`);
      expect(existsSync(join(imagesetDir, 'Contents.json'))).toBe(true);
      expect(existsSync(join(imagesetDir, `${imageset.name}@2x.png`))).toBe(true);
      expect(existsSync(join(imagesetDir, `${imageset.name}@3x.png`))).toBe(true);

      const contents = JSON.parse(readFileSync(join(imagesetDir, 'Contents.json'), 'utf8')) as {
        images: readonly { scale: string }[];
        properties?: { 'template-rendering-intent': string };
      };
      expect(contents.images.map((i) => i.scale).sort()).toEqual(['2x', '3x']);
      if (imageset.template) {
        expect(contents.properties?.['template-rendering-intent']).toBe('template');
      } else {
        expect(contents.properties).toBeUndefined();
      }
    }
  });
});
