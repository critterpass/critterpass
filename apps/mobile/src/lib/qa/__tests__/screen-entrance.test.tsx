import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { act } from 'react';

import { entranceHeld, isLayoutSettled, resetLayoutSettled } from '../layout-settled';
import { ENTRANCE_CAP_MS, useScanOnArrival } from '../screen-entrance';

/** A screen's navigation object as a native stack hands it out: one `transitionEnd` listener. */
function enteringScreen() {
  const listeners = new Set<() => void>();
  return {
    addListener: (_event: 'transitionEnd', listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    arrive: () => {
      for (const listener of [...listeners]) listener();
    },
    listening: () => listeners.size,
  };
}

afterEach(() => {
  jest.useRealTimers();
  resetLayoutSettled();
});

describe('the layout scan waits for a screen to arrive', () => {
  it('holds from mount until the navigator says the screen has arrived', async () => {
    const screen = enteringScreen();
    await renderHook(() => useScanOnArrival(screen));
    expect(entranceHeld()).toBe(true);
    act(() => screen.arrive());
    expect(entranceHeld()).toBe(false);
    // Arriving starts a fresh scan: the screen reads busy until it is measured.
    expect(isLayoutSettled()).toBe(false);
    expect(screen.listening()).toBe(0);
  });

  it('lets go after the cap when the navigator never says so', async () => {
    jest.useFakeTimers();
    const screen = enteringScreen();
    await renderHook(() => useScanOnArrival(screen));
    act(() => jest.advanceTimersByTime(ENTRANCE_CAP_MS - 1));
    expect(entranceHeld()).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(entranceHeld()).toBe(false);
  });

  it('lets go when the screen goes before it arrived', async () => {
    const screen = enteringScreen();
    const { unmount } = await renderHook(() => useScanOnArrival(screen));
    await unmount();
    expect(entranceHeld()).toBe(false);
    expect(screen.listening()).toBe(0);
  });

  it('holds while any of two screens entering together is still on its way', async () => {
    const group = enteringScreen();
    const page = enteringScreen();
    await renderHook(() => useScanOnArrival(group));
    await renderHook(() => useScanOnArrival(page));
    act(() => group.arrive());
    expect(entranceHeld()).toBe(true);
    act(() => page.arrive());
    expect(entranceHeld()).toBe(false);
  });
});
