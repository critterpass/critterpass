/** Android's first layout of a fitted label can lose characters the settled layout keeps. */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import { textLayoutProblems } from '../text-layout-check';
import { resetTextCutState } from '../text-cut-state';
import { reportUiQa, setUiQaSink, TRUNCATION_SETTLE_MS, UI_QA_ENABLED } from '../ui-qa';

const TEXT = 'Leave by · 13:45';
let reports: string[] = [];

function layOut(shown: string): void {
  const problems = textLayoutProblems({
    lines: [{ text: shown }],
    text: TEXT,
    truncationIsBug: true,
  });
  for (const code of problems) reportUiQa(code, 'trip-today-badge', 'badge');
}

const original = Platform.OS;
beforeEach(() => {
  jest.useFakeTimers();
  reports = [];
  resetTextCutState();
  setUiQaSink((line) => reports.push(line));
});
afterEach(() => {
  Platform.OS = original;
  setUiQaSink(null);
  jest.useRealTimers();
});

describe('truncation reports wait for the settled layout', () => {
  it('drops an Android cut that the next layout of the same text fits', () => {
    expect(UI_QA_ENABLED).toBe(true);
    Platform.OS = 'android';
    layOut('Leave by · 13:4');
    layOut(TEXT);
    jest.advanceTimersByTime(TRUNCATION_SETTLE_MS);
    expect(reports).toEqual([]);
  });

  it('reports an Android cut that is still there once the text settled', () => {
    Platform.OS = 'android';
    layOut('Leave by · 13:4');
    expect(reports).toEqual([]);
    jest.advanceTimersByTime(TRUNCATION_SETTLE_MS);
    expect(reports).toEqual(['[ui-qa] TEXT_TRUNCATED "trip-today-badge" badge']);
  });

  it('reports an iOS cut at once (iOS lays a fitted label out once)', () => {
    Platform.OS = 'ios';
    layOut('Leave by · 13:4');
    expect(reports).toEqual(['[ui-qa] TEXT_TRUNCATED "trip-today-badge" badge']);
  });
});
