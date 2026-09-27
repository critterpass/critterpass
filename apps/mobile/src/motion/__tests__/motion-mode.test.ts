import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';

import { combineMotionMode, useMotionMode } from '../motion-mode';
import { resetMotionModeForTests } from '../test-support/reset-motion-mode';

describe('combineMotionMode', () => {
  it('keeps full motion when the OS setting is off and no in-app override is set', () => {
    expect(combineMotionMode(false, 'full')).toBe('full');
  });

  it('floors an in-app "full" to "reduced" when the OS setting is on', () => {
    expect(combineMotionMode(true, 'full')).toBe('reduced');
  });

  it('keeps an in-app "off" even when the OS setting is off', () => {
    expect(combineMotionMode(false, 'off')).toBe('off');
  });

  it('never relaxes an in-app override below the OS floor', () => {
    expect(combineMotionMode(true, 'reduced')).toBe('reduced');
    expect(combineMotionMode(true, 'off')).toBe('off');
  });
});

describe('useMotionMode', () => {
  let isReduceMotionEnabledSpy: jest.SpiedFunction<typeof AccessibilityInfo.isReduceMotionEnabled>;

  beforeEach(async () => {
    await resetMotionModeForTests();
    isReduceMotionEnabledSpy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
  });

  afterEach(() => {
    isReduceMotionEnabledSpy.mockRestore();
  });

  it('defaults to "full" before the OS check resolves and with no stored override', async () => {
    const { result } = await renderHook(() => useMotionMode());
    expect(result.current[0]).toBe('full');
  });

  it('adopts the OS "Reduce Motion" setting once it resolves', async () => {
    isReduceMotionEnabledSpy.mockResolvedValue(true);
    const { result } = await renderHook(() => useMotionMode());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current[0]).toBe('reduced');
  });

  it('persists an in-app override through the returned setter', async () => {
    const { result, rerender } = await renderHook(() => useMotionMode());
    await act(() => {
      result.current[1]('off');
    });
    await rerender(undefined);
    expect(result.current[0]).toBe('off');
  });
});
