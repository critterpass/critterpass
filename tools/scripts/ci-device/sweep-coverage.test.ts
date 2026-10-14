import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  coverage,
  designCodeOf,
  formatCoverage,
  mergedRunShots,
  renderCodes,
  runCoverage,
  runShots,
  sweepShots,
} from './sweep-coverage';

const ROOT = path.resolve(import.meta.dirname, '../../..');

describe('UI sweep', () => {
  it('only lists designs the sweep shoots', () => {
    expect(coverage(ROOT).routeShotsMissing).toEqual([]);
  });

  it('reads the routes, the renders and the screenshot names', () => {
    expect(appRoutes(ROOT)).toContain('crew/new');
    expect(appRoutes(ROOT).some((route) => route.includes('(dev)'))).toBe(false);
    expect(renderCodes(ROOT)).toContain('3.01');
    // Pairs handed to shot.yaml, and shots a flow takes itself (`premium-1.02-loading-light`).
    expect(sweepShots(ROOT)).toEqual(
      expect.arrayContaining(['2.01-splash', '4.05-showdown', '1.02-loading']),
    );
    expect(designCodeOf('3.17-inbox')).toBe('3.17');
    expect(designCodeOf('crew-new-code')).toBeUndefined();
  });

  it('only sweeps designs that have a render', () => {
    const renders = new Set(renderCodes(ROOT));
    const unknown = sweepShots(ROOT).filter((shot) => !renders.has(designCodeOf(shot) ?? ''));
    expect(unknown).toEqual([]);
  });

  it('formats a report with the counts', () => {
    expect(formatCoverage(coverage(ROOT))).toMatch(/Premium designs swept: \*\*\d+ of \d+\*\*/);
  });

  it("counts the designs a run's screenshots captured, per platform", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'run-coverage-'));
    try {
      for (const [shard, files] of [
        ['device-ios-shard-1', ['premium-3.01-home-light.png', 'premium-3.01-home-dark.png']],
        ['device-ios-shard-2', ['premium-4.02-search-light.png', 'screenshot-x.png']],
        ['device-android-shard-1', ['premium-9.10-paywall-light.png']],
      ] as const) {
        mkdirSync(path.join(dir, shard, 'screenshots'), { recursive: true });
        for (const file of files) writeFileSync(path.join(dir, shard, 'screenshots', file), '');
      }
      const shots = runShots(dir);
      expect(runCoverage(shots.get('ios') ?? [], ['3.01', '4.02', '9.10'])).toEqual({
        captured: ['3.01', '4.02'],
        missing: ['9.10'],
        states: 3,
      });
      expect(shots.get('android')).toEqual(['9.10-paywall-light']);
      // The iOS and Android runs downloaded apart are read as one, with both platforms together.
      const merged = mergedRunShots([dir, path.join(dir, 'missing')]);
      expect(runCoverage(merged.get('together') ?? [], ['3.01', '4.02', '9.10']).missing).toEqual(
        [],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
