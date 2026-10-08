import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { createElement, type ContextType, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { E2E_IDLE_LOOP_MS, idleLoopBudgetMs, useIdleLoopRunning } from '../idle-pause';

describe('idleLoopBudgetMs', () => {
  it('gives loops a play budget only in the release build of the development variant', () => {
    expect(idleLoopBudgetMs(false, 'development')).toBe(E2E_IDLE_LOOP_MS);
    expect(idleLoopBudgetMs(true, 'development')).toBeNull();
    expect(idleLoopBudgetMs(false, 'staging')).toBeNull();
    expect(idleLoopBudgetMs(false, 'production')).toBeNull();
    expect(idleLoopBudgetMs(false, undefined)).toBeNull();
  });
});

describe('useIdleLoopRunning', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // The hook's state updates land through React's async act, so each timer step goes through it.
  const advance = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
      return Promise.resolve();
    });

  it('keeps a loop running for as long as it is active when there is no budget', async () => {
    const { result, unmount } = await renderHook(() => useIdleLoopRunning(true, null));
    await advance(5_000);
    expect(result.current).toBe(true);
    await unmount();
  });

  it('rests a loop once its budget is spent and replays it on the next active stretch', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useIdleLoopRunning(active, 1000),
      { initialProps: { active: true } },
    );
    await advance(999);
    expect(result.current).toBe(true);
    await advance(1);
    expect(result.current).toBe(false);

    await rerender({ active: false });
    expect(result.current).toBe(false);
    await rerender({ active: true });
    await advance(999);
    expect(result.current).toBe(true);
  });

  it('rests a loop while its screen is covered and plays it again when it is back', async () => {
    let focused = true;
    const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
    const navigation = {
      isFocused: () => focused,
      addListener: (type: 'focus' | 'blur', listener: () => void) => {
        listeners[type].add(listener);
        return () => listeners[type].delete(listener);
      },
    } as unknown as NonNullable<ContextType<typeof NavigationContext>>;
    const focus = (next: boolean) =>
      act(() => {
        focused = next;
        for (const listener of listeners[next ? 'focus' : 'blur']) listener();
        return Promise.resolve();
      });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(NavigationContext.Provider, { value: navigation }, children);

    const { result } = await renderHook(() => useIdleLoopRunning(true, null), { wrapper });
    expect(result.current).toBe(true);
    await focus(false);
    expect(result.current).toBe(false);
    await focus(true);
    expect(result.current).toBe(true);
  });

  it('rests a loop while the app is in the background', async () => {
    const appListeners: ((state: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appListeners.push(listener);
      return { remove: () => undefined };
    });
    const app = (state: AppStateStatus) =>
      act(() => {
        for (const listener of appListeners) listener(state);
        return Promise.resolve();
      });

    const { result } = await renderHook(() => useIdleLoopRunning(true, null));
    expect(result.current).toBe(true);
    await app('background');
    expect(result.current).toBe(false);
    await app('active');
    expect(result.current).toBe(true);
    spy.mockRestore();
  });

  it('never runs a loop nobody asked for, however visible', async () => {
    const { result } = await renderHook(() => useIdleLoopRunning(false, null));
    expect(result.current).toBe(false);
  });
});
