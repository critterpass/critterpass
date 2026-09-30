import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { act } from 'react';

import {
  focusedBackAffordances,
  missingBackAffordance,
  useBackAffordance,
} from '../back-affordance';
import { headerLayoutProblems, useHeaderOverlapGuard } from '../header-overlap';
import type { QaMeasurable, QaRect } from '../header-overlap';
import { checkIconDraws, iconDrawsNothing } from '../icon-check';
import { setUiQaSink, UI_QA_ENABLED } from '../ui-qa';

let reports: string[] = [];
beforeEach(() => {
  reports = [];
  setUiQaSink((line) => reports.push(line));
});
afterEach(() => setUiQaSink(null));

const rect = (x: number, width: number, y = 0, height = 40): QaRect => ({ x, y, width, height });

describe('HEADER_OVERLAP', () => {
  it('passes controls side by side, touching at most', () => {
    const row = new Map([
      ['title', rect(16, 200)],
      ['pill', rect(216, 120)],
      ['bell', rect(340, 40)],
    ]);
    expect(headerLayoutProblems(row, 390)).toEqual([]);
  });

  it('reports a title drawn under the crew pill and a pill pushed off the screen', () => {
    const row = new Map([
      ['caret', rect(250, 16)],
      ['chat', rect(240, 110)],
      ['join', rect(300, 160)],
    ]);
    expect(headerLayoutProblems(row, 390)).toEqual([
      'caret overlaps chat',
      'chat overlaps join',
      'join runs off the screen',
    ]);
  });

  it('ignores controls on different lines and ones not laid out yet', () => {
    const row = new Map([
      ['greeting', rect(16, 300, 0, 20)],
      ['crew', rect(16, 300, 24, 40)],
      ['hidden', rect(16, 0)],
    ]);
    expect(headerLayoutProblems(row, 390)).toEqual([]);
  });

  it('measures the row once its layout settles and reports what collides', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useHeaderOverlapGuard('home-header'));
    const node = (r: QaRect) =>
      ({
        measureInWindow: (done: (x: number, y: number, w: number, h: number) => void) =>
          done(r.x, r.y, r.width, r.height),
      }) satisfies QaMeasurable;
    act(() => {
      result.current.ref('caret')(node(rect(250, 16)));
      result.current.ref('chat')(node(rect(240, 110)));
      result.current.onLayout();
    });
    expect(reports).toEqual([]);
    act(() => jest.runAllTimers());
    jest.useRealTimers();
    expect(reports).toEqual(
      UI_QA_ENABLED ? ['[ui-qa] HEADER_OVERLAP "home-header: caret overlaps chat"'] : [],
    );
  });
});

describe('NO_BACK_AFFORDANCE', () => {
  it('is missing only on a pushed, user-facing screen with no back or close control', () => {
    const base = { canGoBack: true, developerTool: false, affordances: 0 };
    expect(missingBackAffordance(base)).toBe(true);
    expect(missingBackAffordance({ ...base, affordances: 1 })).toBe(false);
    expect(missingBackAffordance({ ...base, canGoBack: false })).toBe(false);
    expect(missingBackAffordance({ ...base, developerTool: true })).toBe(false);
  });

  it('counts a mounted back control while its screen is focused', async () => {
    const before = focusedBackAffordances();
    const { unmount } = await renderHook(() => useBackAffordance());
    expect(focusedBackAffordances()).toBe(before + (UI_QA_ENABLED ? 1 : 0));
    await unmount();
    expect(focusedBackAffordances()).toBe(before);
  });
});

/* eslint-disable critterpass/no-literal-style -- the check reads raw colour strings: these are its inputs */
describe('ICON_EMPTY', () => {
  it('passes an icon with one visible shape', () => {
    expect(iconDrawsNothing([{ fill: undefined }, { fill: '#f7d154' }])).toBe(false);
  });

  it('flags an icon whose shapes have no paint, no opacity or a clear colour', () => {
    expect(iconDrawsNothing([{ fill: undefined }, { fill: undefined }])).toBe(true);
    expect(iconDrawsNothing([{ fill: '#f7d154', opacity: 0 }])).toBe(true);
    expect(iconDrawsNothing([{ fill: 'transparent' }, { fill: '#ffffff00' }])).toBe(true);
    expect(iconDrawsNothing([{ fill: 'rgba(0, 0, 0, 0)' }, { fill: '#0000' }])).toBe(true);
    expect(iconDrawsNothing([])).toBe(true);
  });

  it('reports the icon by name', () => {
    checkIconDraws('sun', [{ fill: undefined }]);
    checkIconDraws('bell', [{ fill: '#ffffff' }]);
    expect(reports).toEqual(UI_QA_ENABLED ? ['[ui-qa] ICON_EMPTY "sun"'] : []);
  });
});
