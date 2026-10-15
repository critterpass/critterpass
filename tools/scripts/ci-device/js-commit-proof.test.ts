import { describe, expect, it } from 'vitest';

import { buildCommits, commitProblem } from './js-commit-proof';

describe('JS commit proof', () => {
  it('reads the build lines out of a report log and logcat', () => {
    const log = [
      '[ui-qa] TEXT_TRUNCATED "home: title"',
      '[qa-build] js:268dd7a91c2f',
      '10-14 08:39:04.859  4321  4400 I ReactNativeJS: [qa-build] js:268dd7a91c2f',
    ].join('\n');
    expect(buildCommits(log)).toEqual(['268dd7a91c2f', '268dd7a91c2f']);
  });

  it('passes only when the app reported this run export, and every time', () => {
    expect(commitProblem(['abc', 'abc'], 'abc')).toBeNull();
    expect(commitProblem([], 'abc')).toContain('never logged');
    expect(commitProblem(['abc', 'local'], 'abc')).toContain('from local');
  });
});
