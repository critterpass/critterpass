import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  coverage,
  designCodeOf,
  formatCoverage,
  renderCodes,
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
});
