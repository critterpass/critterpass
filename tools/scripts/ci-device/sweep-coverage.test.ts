import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  coverage,
  designIdOf,
  formatCoverage,
  registryIds,
  SCENARIOS,
  sweepFlows,
  sweepShots,
  SWEEP_DIR,
} from './sweep-coverage';

const ROOT = path.resolve(import.meta.dirname, '../../..');

describe('UI sweep', () => {
  it('has its top-level flows in sync with the scenarios (run it with --write after a change)', () => {
    for (const { file, text } of sweepFlows())
      expect({ file, text: readFileSync(path.join(ROOT, file), 'utf8') }).toEqual({ file, text });
  });

  it('has a subflow for every scenario', () => {
    for (const { name } of SCENARIOS)
      expect(existsSync(path.join(ROOT, SWEEP_DIR, 'subflows', `${name}.yaml`))).toBe(true);
  });

  it('only lists screenshots the sweep takes', () => {
    expect(coverage(ROOT).routeShotsMissing).toEqual([]);
  });

  it('reads the registry, the routes and the screenshot names', () => {
    expect(registryIds(ROOT).registered).toContain('3b-4');
    expect(appRoutes(ROOT)).toContain('crew/new');
    expect(appRoutes(ROOT).some((route) => route.includes('(dev)'))).toBe(false);
    expect(sweepShots(ROOT)).toContain('3c-1-showdown');
    expect(designIdOf('3c-1-showdown')).toBe('3c-1');
    expect(designIdOf('crew-new-code')).toBeUndefined();
  });

  it('formats a report with the counts', () => {
    expect(formatCoverage(coverage(ROOT))).toMatch(/Registered screens swept: \*\*\d+ of \d+\*\*/);
  });
});
