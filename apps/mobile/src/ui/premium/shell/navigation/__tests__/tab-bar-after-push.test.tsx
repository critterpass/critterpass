import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { focusedPath, PUSH_LANDS_MS, useTabBarHiddenAfterMoves } from '../tab-bar-after-push';

describe('focusedPath', () => {
  it('follows the focused route down every level', () => {
    const state = {
      index: 0,
      routes: [
        {
          key: 'tabs-1',
          name: '(tabs)',
          state: {
            index: 1,
            routes: [
              { key: 'home-1', name: 'index' },
              {
                key: 'wallet-1',
                name: 'wallet',
                state: { routes: [{ key: 'add-3', name: 'add' }] },
              },
            ],
          },
        },
      ],
    };
    expect(focusedPath(state)).toBe('tabs-1/wallet-1/add-3');
    expect(focusedPath(undefined)).toBe('');
  });
});

describe('useTabBarHiddenAfterMoves', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('hides the bar once a push has landed, and again after each later move', async () => {
    const { result, rerender } = await renderHook(
      ({ pushed, path }: { pushed: boolean; path: string }) =>
        useTabBarHiddenAfterMoves(pushed, path),
      { initialProps: { pushed: false, path: 'wallet' } },
    );
    expect(result.current).toBe(false);
    await rerender({ pushed: true, path: 'wallet/add' });
    expect(result.current).toBe(false);
    await act(() => {
      jest.advanceTimersByTime(PUSH_LANDS_MS);
    });
    expect(result.current).toBe(true);
    // A second push lets the bar go while the system shows it, then hides it again.
    await rerender({ pushed: true, path: 'wallet/add/edit' });
    expect(result.current).toBe(false);
    await act(() => {
      jest.advanceTimersByTime(PUSH_LANDS_MS);
    });
    expect(result.current).toBe(true);
  });

  it('shows the bar at once back on the tab root', async () => {
    const { result, rerender } = await renderHook(
      ({ pushed, path }: { pushed: boolean; path: string }) =>
        useTabBarHiddenAfterMoves(pushed, path),
      { initialProps: { pushed: true, path: 'wallet/add' } },
    );
    await act(() => {
      jest.advanceTimersByTime(PUSH_LANDS_MS);
    });
    expect(result.current).toBe(true);
    await rerender({ pushed: false, path: 'wallet' });
    expect(result.current).toBe(false);
  });
});
