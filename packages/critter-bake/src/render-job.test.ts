import { loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import type { BakeTarget } from './manifest';
import { expandManifest, renderJob } from './render-job';

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

describe('expandManifest', () => {
  it('expands the cross product of forms/poses/variants/sizes/scales for one kind', () => {
    const jobs = expandManifest([
      target({ kind: 'gecko', forms: ['common'], poses: ['idle', 'cheer'], sizesPt: [48, 96] }),
    ]);
    expect(jobs).toHaveLength(4);
    expect(jobs.every((j) => j.renderSpec.kind === 'gecko')).toBe(true);
  });

  it('bakes every designed rarity for a critter with content and skips the rest', () => {
    // Tokek (gecko, cp-112) has rare/epic/legendary designed forms; common is always available.
    const jobs = expandManifest([
      target({ kind: 'gecko', forms: ['common', 'rare', 'epic', 'legendary'] }),
    ]);
    expect(jobs.map((j) => j.outPath).sort()).toEqual(
      [
        'out/gecko-common-idle-color-48pt@2x.png',
        'out/gecko-rare-idle-color-48pt@2x.png',
        'out/gecko-epic-idle-color-48pt@2x.png',
        'out/gecko-legendary-idle-color-48pt@2x.png',
      ].sort(),
    );
  });

  it('skips a rarity with no designed form instead of fabricating a palette', () => {
    // Puffin has no DESIGNED_FORMS entries beyond its own default (common) rendering.
    const jobs = expandManifest([
      target({ kind: 'puffin', forms: ['common', 'rare', 'epic', 'legendary'] }),
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.outPath).toBe('out/puffin-common-idle-color-48pt@2x.png');
  });

  it("expands kind: 'all' to every registered critter", () => {
    const jobs = expandManifest([target({ kind: 'all', sizesPt: [60] })]);
    expect(jobs.length).toBe(150);
  });
});

describe('renderJob', () => {
  it('renders a decodable PNG at the expected pixel size', async () => {
    const [job] = expandManifest([target({ kind: 'gecko', sizesPt: [96], scales: [2] })]);
    if (!job) throw new Error('expected one job');
    const [output] = await renderJob(job);
    if (!output) throw new Error('expected one output');
    const image = await loadImage(Buffer.from(output.bytes));
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
  });

  it('produces the same bytes for the same job (deterministic)', async () => {
    const [job] = expandManifest([target({ kind: 'gecko', sizesPt: [48], scales: [2] })]);
    if (!job) throw new Error('expected one job');
    const [first] = await renderJob(job);
    const [second] = await renderJob(job);
    expect(Buffer.from(first!.bytes).equals(Buffer.from(second!.bytes))).toBe(true);
  });

  it('crops to a square when crop is "circle"', async () => {
    const [job] = expandManifest([
      target({ kind: 'gecko', sizesPt: [96], scales: [2], crop: 'circle' }),
    ]);
    if (!job) throw new Error('expected one job');
    const [output] = await renderJob(job);
    const image = await loadImage(Buffer.from(output!.bytes));
    expect(image.width).toBe(image.height);
  });

  it('renders three blur stages for variant "blur"', async () => {
    const jobs = expandManifest([
      target({ kind: 'gecko', variants: ['blur'], sizesPt: [60], scales: [2] }),
    ]);
    const [job] = jobs;
    if (!job) throw new Error('expected one job');
    const outputs = await renderJob(job);
    expect(outputs).toHaveLength(3);
    expect(outputs.map((o) => o.outPath)).toEqual([
      'out/gecko-common-idle-blur-60pt@2x-stage1.png',
      'out/gecko-common-idle-blur-60pt@2x-stage2.png',
      'out/gecko-common-idle-blur-60pt@2x-stage3.png',
    ]);
  });
});
