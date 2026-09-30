/**
 * Full brightness while a pass shows: the window goes to maximum and back to what it was on
 * close, and a build without the brightness module leaves the screen alone.
 */
let mockBrightnessInstalled = true;
jest.mock('expo', () => {
  const actual = jest.requireActual<typeof ExpoModule>('expo');
  return {
    ...actual,
    requireOptionalNativeModule: (name: string): unknown =>
      name === 'ExpoBrightness'
        ? mockBrightnessInstalled
          ? {}
          : null
        : actual.requireOptionalNativeModule(name),
  };
});
const mockSetBrightness = jest.fn((_level: number) => Promise.resolve());
jest.mock('expo-brightness', () => ({
  getBrightnessAsync: () => Promise.resolve(0.4),
  setBrightnessAsync: (level: number) => mockSetBrightness(level),
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type * as ExpoModule from 'expo';

import { useFullBrightness } from '../boarding-pass/use-full-brightness';

describe('full brightness while a pass shows', () => {
  beforeEach(() => {
    mockSetBrightness.mockClear();
    mockBrightnessInstalled = true;
  });

  it('turns the window to full and back to what it was when the pass closes', async () => {
    const { unmount } = await renderHook(() => useFullBrightness(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSetBrightness.mock.calls).toEqual([[1]]);
    await unmount();
    expect(mockSetBrightness.mock.calls).toEqual([[1], [0.4]]);
  });

  it('leaves the brightness alone while inactive', async () => {
    await renderHook(() => useFullBrightness(false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSetBrightness).not.toHaveBeenCalled();
  });

  it('leaves the brightness alone in a build without the brightness module', async () => {
    mockBrightnessInstalled = false;
    const { unmount } = await renderHook(() => useFullBrightness(true));
    await act(async () => {
      await Promise.resolve();
    });
    await unmount();
    expect(mockSetBrightness).not.toHaveBeenCalled();
  });
});
