import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { createNetworkState } from '@/data/status/network';

import { useRetryStart } from '../data/retry-start';

describe('asking again for a draft start with no answer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks again on a beat while online: a busy server never sends "back online"', async () => {
    const network = createNetworkState(true);
    const retry = jest.fn(() => Promise.resolve());
    await renderHook(() => useRetryStart(true, network, retry, 1000));
    expect(retry).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('waits for signal while offline, and asks the moment it is back', async () => {
    const network = createNetworkState(false);
    const retry = jest.fn(() => Promise.resolve());
    await renderHook(() => useRetryStart(true, network, retry, 1000));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(retry).not.toHaveBeenCalled();
    await act(async () => {
      network.set(true);
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('never overlaps a start still on its way, and stops once the start has an answer', async () => {
    const network = createNetworkState(true);
    let finish: () => void = () => undefined;
    const retry = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const hook = await renderHook(
      ({ waiting }: { waiting: boolean }) => useRetryStart(waiting, network, retry, 1000),
      { initialProps: { waiting: true } },
    );
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    await hook.rerender({ waiting: false });
    await act(async () => {
      jest.advanceTimersByTime(5000);
      network.set(false);
      network.set(true);
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
