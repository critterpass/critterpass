/**
 * A proposal opened before this phone has it waits for its rows; only one that stays missing for
 * the whole wait is called missing, and one that arrives in time never is.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { MISSING_AFTER_MS, useStillMissing } from '../use-still-missing';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('a proposal that is not on the phone', () => {
  it('is called missing only after the whole wait', async () => {
    const { result } = await renderHook(() => useStillMissing(true));
    expect(result.current).toBe(false);
    await act(() => {
      jest.advanceTimersByTime(MISSING_AFTER_MS - 1);
    });
    expect(result.current).toBe(false);
    await act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('is never called missing when its rows arrive in time, and waits again after', async () => {
    const { result, rerender } = await renderHook(
      ({ missing }: { missing: boolean }) => useStillMissing(missing),
      { initialProps: { missing: true } },
    );
    await act(() => {
      jest.advanceTimersByTime(MISSING_AFTER_MS / 2);
    });
    await rerender({ missing: false });
    await act(() => {
      jest.advanceTimersByTime(MISSING_AFTER_MS);
    });
    expect(result.current).toBe(false);
    await rerender({ missing: true });
    expect(result.current).toBe(false);
  });
});
