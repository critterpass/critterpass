import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { createElement, type ContextType, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useNow } from '../use-now';

type Navigation = NonNullable<ContextType<typeof NavigationContext>>;

/** A screen's navigation object, as far as focus goes, with a switch to blur and focus it. */
function screen() {
  let focused = true;
  const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
  const navigation = {
    isFocused: () => focused,
    addListener: (type: 'focus' | 'blur', listener: () => void) => {
      listeners[type].add(listener);
      return () => listeners[type].delete(listener);
    },
  } as unknown as Navigation;
  const set = (next: boolean) => {
    focused = next;
    for (const listener of listeners[next ? 'focus' : 'blur']) listener();
  };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(NavigationContext.Provider, { value: navigation }, children);
  return { wrapper, set };
}

const START = Date.parse('2026-10-08T09:00:20.400Z');
const at = (iso: string) => Date.parse(`2026-10-08T${iso}Z`);

describe('useNow', () => {
  let appListeners: ((state: AppStateStatus) => void)[] = [];
  const app = (state: AppStateStatus) =>
    act(() => {
      for (const listener of appListeners) listener(state);
      return Promise.resolve();
    });
  const advance = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
      return Promise.resolve();
    });

  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    appListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appListeners.push(listener);
      return { remove: () => undefined };
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('ticks on the interval boundary while its screen is focused and the app is in front', async () => {
    const { wrapper } = screen();
    const { result, unmount } = await renderHook(() => useNow(60_000), { wrapper });
    expect(result.current.getTime()).toBe(START);
    await advance(39_599);
    expect(result.current.getTime()).toBe(START);
    await advance(1);
    expect(result.current.getTime()).toBe(at('09:01:00.000'));
    await advance(60_000);
    expect(result.current.getTime()).toBe(at('09:02:00.000'));
    await unmount();
  });

  it('stops when the screen is covered and comes back with the time it is then', async () => {
    const { wrapper, set } = screen();
    const { result } = await renderHook(() => useNow(1000), { wrapper });
    await advance(600);
    expect(result.current.getTime()).toBe(at('09:00:21.000'));

    await act(() => {
      set(false);
      return Promise.resolve();
    });
    await advance(90_250);
    expect(result.current.getTime()).toBe(at('09:00:21.000'));

    await act(() => {
      set(true);
      return Promise.resolve();
    });
    expect(result.current.getTime()).toBe(at('09:01:51.250'));
    await advance(750);
    expect(result.current.getTime()).toBe(at('09:01:52.000'));
  });

  it('stops in the background and comes back with the time it is then', async () => {
    const { wrapper } = screen();
    const { result } = await renderHook(() => useNow(1000), { wrapper });
    await app('background');
    await advance(300_000);
    expect(result.current.getTime()).toBe(START);

    await app('active');
    expect(result.current.getTime()).toBe(START + 300_000);
    await advance(1000);
    expect(result.current.getTime()).toBe(at('09:05:21.000'));
  });

  it('runs outside a navigator, and rests while switched off', async () => {
    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useNow(5000, { enabled }),
      { initialProps: { enabled: false } },
    );
    await advance(12_000);
    expect(result.current.getTime()).toBe(START);

    await rerender({ enabled: true });
    expect(result.current.getTime()).toBe(START + 12_000);
    await advance(2600);
    expect(result.current.getTime()).toBe(at('09:00:35.000'));
  });
});
