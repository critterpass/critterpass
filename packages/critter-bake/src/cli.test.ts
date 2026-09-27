import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bake, parseArgs } from './cli';

function writeManifest(dir: string, out: string): string {
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      targets: [
        {
          kind: ['gecko', 'tanuki'],
          forms: ['common'],
          poses: ['idle'],
          variants: ['color'],
          sizesPt: [48],
          scales: [2],
          out,
        },
      ],
    }),
  );
  return manifestPath;
}

describe('parseArgs', () => {
  it('resolves the manifest path against cwd and applies defaults', () => {
    const options = parseArgs(['--manifest', 'manifests/tier-a.json'], '/repo');
    expect(options.manifestPath).toBe('/repo/manifests/tier-a.json');
    expect(options.check).toBe(false);
    expect(options.concurrency).toBe(2);
  });

  it('reads --check and --only', () => {
    const options = parseArgs(['--manifest', 'm.json', '--check', '--only', 'gecko'], '/repo');
    expect(options.check).toBe(true);
    expect(options.only).toBe('gecko');
  });

  it('throws when --manifest is missing', () => {
    expect(() => parseArgs([])).toThrow(/--manifest/);
  });
});

describe('bake (CLI core acceptance)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }, 20_000);

  it('bakes files, writes zero files on an unchanged re-run, and --check catches a stale output', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-cli-'));
    const manifestPath = writeManifest(dir, 'out');

    const first = await bake({
      manifestPath,
      only: undefined,
      check: false,
      concurrency: 2,
      cwd: dir,
    });
    expect(first.written).toBeGreaterThan(0);
    expect(first.unchanged).toBe(0);
    expect(first.totalOutputs).toBe(first.written);

    const outFile = join(dir, 'out', 'gecko-common-idle-color-48pt@2x.png');
    expect(existsSync(outFile)).toBe(true);
    const bytesAfterFirstBake = readFileSync(outFile);

    const second = await bake({
      manifestPath,
      only: undefined,
      check: false,
      concurrency: 2,
      cwd: dir,
    });
    expect(second.written).toBe(0);
    expect(second.unchanged).toBe(second.totalOutputs);
    expect(readFileSync(outFile).equals(bytesAfterFirstBake)).toBe(true);

    const checkClean = await bake({
      manifestPath,
      only: undefined,
      check: true,
      concurrency: 2,
      cwd: dir,
    });
    expect(checkClean.staleOutPaths).toEqual([]);

    // Simulate a stale output: hand-edit the file on disk without re-baking.
    writeFileSync(outFile, Buffer.from([0, 1, 2, 3]));
    const checkStale = await bake({
      manifestPath,
      only: undefined,
      check: true,
      concurrency: 2,
      cwd: dir,
    });
    expect(checkStale.staleOutPaths).toContain('out/gecko-common-idle-color-48pt@2x.png');
    // --check must never write.
    expect(readFileSync(outFile).equals(Buffer.from([0, 1, 2, 3]))).toBe(true);
  }, 30_000);

  it('filters jobs with --only', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-cli-'));
    const manifestPath = writeManifest(dir, 'out');
    const result = await bake({
      manifestPath,
      only: 'tanuki',
      check: false,
      concurrency: 2,
      cwd: dir,
    });
    expect(result.totalOutputs).toBe(1);
    expect(existsSync(join(dir, 'out', 'tanuki-common-idle-color-48pt@2x.png'))).toBe(true);
    expect(existsSync(join(dir, 'out', 'gecko-common-idle-color-48pt@2x.png'))).toBe(false);
  }, 20_000);
});
