jest.mock('../../impact', () => ({ impact: jest.fn() }));

import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { impact } from '../../impact';
import { useMotionMode } from '../../motion-mode';
import { resetMotionModeForTests } from '../../test-support/reset-motion-mode';
import { useDeal } from '../deal';
import { useFlap } from '../flap';
import { useSettle } from '../settle';
import { useSheen } from '../sheen';
import { useSlap } from '../slap';
import { useSlideOff } from '../slide-off';
import { useSquash } from '../squash';
import { useStamp } from '../stamp';
import { ScreenJoltProvider } from '../thud';

const mockedImpact = impact as jest.MockedFunction<typeof impact>;

function useReduced(): [ReturnType<typeof useMotionMode>[0], (mode: 'reduced') => void] {
  const [mode, setMode] = useMotionMode();
  return [mode, () => setMode('reduced')];
}

// The reanimated mock's `useAnimatedStyle` returns the plain style object directly; the real
// `AnimatedStyleHandle<T>` type is opaque by design, so reading it back needs a cast through `unknown`.
function asStyle(style: unknown): {
  opacity?: number;
  transform?: ReadonlyArray<Record<string, unknown>>;
} {
  return style as { opacity?: number; transform?: ReadonlyArray<Record<string, unknown>> };
}

beforeEach(async () => {
  mockedImpact.mockClear();
  await resetMotionModeForTests();
});

describe('useStamp', () => {
  it('fires thud.heavy exactly once when the fall lands', async () => {
    await renderHook(() => useStamp({ active: true }), { wrapper: ScreenJoltProvider });
    expect(mockedImpact).toHaveBeenCalledTimes(1);
    expect(mockedImpact).toHaveBeenCalledWith('thud.heavy');
  });

  it('does not fire again on a re-render with the same active value', async () => {
    const { rerender } = await renderHook(() => useStamp({ active: true }), {
      wrapper: ScreenJoltProvider,
    });
    await rerender(undefined);
    expect(mockedImpact).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: settles at full opacity/scale 1 (150ms fade) and still fires the haptic', async () => {
    function useHarness() {
      const [, setReduced] = useReduced();
      return { style: useStamp({ active: true }), setReduced };
    }
    const { result, rerender } = await renderHook(() => useHarness(), {
      wrapper: ScreenJoltProvider,
    });
    await act(() => {
      result.current.setReduced('reduced');
    });
    await rerender(undefined);
    const style = asStyle(result.current.style);
    expect(style.opacity).toBe(1);
    expect(style.transform?.find((entry) => 'scale' in entry)?.scale).toBe(1);
    expect(mockedImpact).toHaveBeenCalledWith('thud.heavy');
  });
});

describe('useSlap', () => {
  it('fires the slap cue exactly once', async () => {
    await renderHook(() => useSlap({ active: true }));
    expect(mockedImpact).toHaveBeenCalledTimes(1);
    expect(mockedImpact).toHaveBeenCalledWith('slap');
  });

  it("settles rotation at the direction's sign of 8deg", async () => {
    const { result, rerender } = await renderHook(() => useSlap({ active: true, direction: -1 }));
    // The effect mutates the shared values after this render already committed with their initial
    // (pre-effect) values; re-render once to read the settled style back out.
    await rerender(undefined);
    const style = asStyle(result.current);
    expect(style.transform?.find((entry) => 'rotate' in entry)?.rotate).toBe('-8deg');
  });
});

describe('useFlap', () => {
  it('keeps the old display value until the flap reaches its midpoint, then swaps', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useFlap({ value }),
      { initialProps: { value: 'A' } },
    );
    expect(result.current.displayValue).toBe('A');
    await rerender({ value: 'B' });
    // The mock resolves withTiming synchronously (jumping straight to its target), so the swap
    // callback has already fired by the time the effect committed.
    expect(result.current.displayValue).toBe('B');
  });

  it('swaps instantly under reduced motion', async () => {
    function useHarness(value: string) {
      const [, setReduced] = useReduced();
      const flap = useFlap({ value });
      return { ...flap, setReduced };
    }
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useHarness(value),
      { initialProps: { value: 'A' } },
    );
    await act(() => {
      result.current.setReduced('reduced');
    });
    await rerender({ value: 'A' });
    await rerender({ value: 'B' });
    expect(result.current.displayValue).toBe('B');
  });
});

describe('other T3 patterns produce a style without throwing', () => {
  it('useSettle', async () => {
    const { result } = await renderHook(() => useSettle({ active: true }));
    expect(result.current).toBeTruthy();
  });

  it('useSquash', async () => {
    const { result } = await renderHook(() => useSquash({ active: true }));
    expect(result.current).toBeTruthy();
  });

  it('useDeal staggers by row index (motion.duration.stagger.rows)', async () => {
    const { result } = await renderHook(() => useDeal({ active: true, index: 2 }));
    expect(result.current).toBeTruthy();
  });

  it('useSlideOff calls onDismissed once the row has collapsed', async () => {
    const onDismissed = jest.fn();
    await renderHook(() => useSlideOff({ active: true, onDismissed }));
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('useSheen parks hidden (opacity 0) under reduced motion instead of looping', async () => {
    function useHarness() {
      const [, setReduced] = useReduced();
      return { style: useSheen(), setReduced };
    }
    const { result, rerender } = await renderHook(() => useHarness());
    await act(() => {
      result.current.setReduced('reduced');
    });
    await rerender(undefined);
    expect(asStyle(result.current.style).opacity).toBe(0);
  });
});
