import { describe, expect, it } from 'vitest';

import { interestingLines, parseArgs } from './remote-test';

describe('remote test runner arguments', () => {
  it('defaults to the database suite and keeps test args after --', () => {
    expect(parseArgs(['@cp/api', '--', 'test/routes/guide.db.test.ts'])).toEqual({
      packageName: '@cp/api',
      script: 'test:db',
      args: 'test/routes/guide.db.test.ts',
    });
  });

  it('takes another script and quotes a spaced pattern so the runner splits it back', () => {
    expect(parseArgs(['@cp/worker', '--script', 'test', '--', '-t', 'phrase audio'])).toEqual({
      packageName: '@cp/worker',
      script: 'test',
      args: '-t "phrase audio"',
    });
  });

  it('refuses anything that is not a workspace package', () => {
    expect(() => parseArgs(['api'])).toThrow(/usage/u);
    expect(() => parseArgs([])).toThrow(/usage/u);
  });

  it('keeps only summary and failure lines from a run log', () => {
    const log = [
      'run\tRun the suite\t2026-10-01T00:00:00.0000000Z  ✓ test/a.test.ts (3 tests) 12ms',
      'run\tRun the suite\t2026-10-01T00:00:01.0000000Z  × test/b.test.ts > saves the answer',
      'run\tRun the suite\t2026-10-01T00:00:02.0000000Z  Test Files  1 failed | 1 passed (2)',
    ].join('\n');
    expect(interestingLines(log)).toEqual([
      ' × test/b.test.ts > saves the answer',
      ' Test Files  1 failed | 1 passed (2)',
    ]);
  });
});
