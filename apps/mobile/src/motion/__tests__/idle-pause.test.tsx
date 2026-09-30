import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

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
});
