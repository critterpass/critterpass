import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { reportTruncatedToastTitle } from '../toast-title-check';
import { setUiQaSink } from '../ui-qa';

const TITLE = 'One two three four five six seven eight nine ten';
let reports: string[] = [];

beforeEach(() => {
  reports = [];
  setUiQaSink((line) => reports.push(line));
});
afterEach(() => setUiQaSink(null));

describe('toast title check', () => {
  it('reports a title that lost words on its lines, once', () => {
    const cut = [{ text: 'One two three four ' }, { text: 'five six seven…' }];
    reportTruncatedToastTitle(TITLE, cut);
    reportTruncatedToastTitle(TITLE, cut);
    expect(reports).toEqual([
      '[ui-qa] TEXT_TRUNCATED "One two three four five six seven eight " toast title',
    ]);
  });

  it('says nothing about a title that fits', () => {
    reportTruncatedToastTitle(TITLE, [
      { text: 'One two three four five ' },
      { text: 'six seven eight nine ten' },
    ]);
    expect(reports).toEqual([]);
  });
});
