jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useIsFocused } from 'expo-router';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { useSharedClock } from '../clock';
import { useMotionMode } from '../motion-mode';
import {
  LOOP_PRESET_IDS,
  LOOP_PRESETS,
  restingLoopTransform,
  sampleLoopPreset,
  type LoopPresetId,
  type LoopTransform,
} from '../presets';
import { motionFreeze, setMotionFreeze } from '../slowmo';
import { resetMotionModeForTests } from '../test-support/reset-motion-mode';
import { useLoop } from '../use-loop';

const mockedUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;

function expectTransformCloseTo(actual: LoopTransform, expected: LoopTransform): void {
  expect(actual.tx).toBeCloseTo(expected.tx, 9);
  expect(actual.ty).toBeCloseTo(expected.ty, 9);
  expect(actual.r).toBeCloseTo(expected.r, 9);
  expect(actual.sx).toBeCloseTo(expected.sx, 9);
  expect(actual.sy).toBeCloseTo(expected.sy, 9);
  expect(actual.o).toBeCloseTo(expected.o, 9);
}

describe('sampleLoopPreset', () => {
  it('has all 10 documented presets with their design durations', () => {
    const expectedDurationMs: Record<LoopPresetId, number> = {
      bob: 2400,
      float: 4200,
      wiggle: 1600,
      pulse: 1600,
      ping: 1800,
      spin: 9000,
      marquee: 16000,
      blink: 1200,
      hop: 2600,
      grow: 780, // "600-900ms in app" resolves to the `extra` duration token
    };
    expect(LOOP_PRESET_IDS).toHaveLength(10);
    for (const id of LOOP_PRESET_IDS) {
      expect(LOOP_PRESETS[id].durationMs).toBe(expectedDurationMs[id]);
    }
  });

  it('returns the first stop at t=0 and wraps seamlessly back to it at t=1', () => {
    for (const id of LOOP_PRESET_IDS) {
      const def = LOOP_PRESETS[id];
      const atZero = sampleLoopPreset(def, 0);
      const atOne = sampleLoopPreset(def, 1);
      expect(atZero).toEqual(atOne);
      expect(atZero).toEqual(restingLoopTransform(id));
    }
  });

  it("reaches bob's midpoint (ty -6) exactly halfway through the cycle", () => {
    expect(sampleLoopPreset(LOOP_PRESETS.bob, 0.5).ty).toBeCloseTo(-6, 5);
  });

  it('interpolates spin (linear) to exactly 180 degrees halfway through the cycle', () => {
    expect(sampleLoopPreset(LOOP_PRESETS.spin, 0.5).r).toBeCloseTo(180, 5);
  });

  it('never jumps discontinuously between adjacent phase samples', () => {
    for (const id of LOOP_PRESET_IDS) {
      const def = LOOP_PRESETS[id];
      let previous = sampleLoopPreset(def, 0);
      for (let phase = 0.02; phase <= 1; phase += 0.02) {
        const current = sampleLoopPreset(def, phase);
        expect(Math.abs(current.tx - previous.tx)).toBeLessThan(30);
        expect(Math.abs(current.ty - previous.ty)).toBeLessThan(30);
        previous = current;
      }
    }
  });

  it('treats phase as cyclic: any integer offset samples the same transform', () => {
    const def = LOOP_PRESETS.wiggle;
    expectTransformCloseTo(sampleLoopPreset(def, 0.3), sampleLoopPreset(def, 3.3));
    expectTransformCloseTo(sampleLoopPreset(def, 0.3), sampleLoopPreset(def, -0.7));
  });
});

describe('useLoop', () => {
  beforeEach(async () => {
    await resetMotionModeForTests();
    jest.useFakeTimers();
    mockedUseIsFocused.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function useLoopHarness(id: LoopPresetId) {
    const [, setMotionMode] = useMotionMode();
    return { style: useLoop(id), setMotionMode };
  }

  // The mock's `useAnimatedStyle` (test-support/reanimated-mock.ts) returns the plain style object
  // directly; the real `AnimatedStyleHandle<T>` type is opaque by design (consumers only ever pass
  // it straight to a component's `style` prop), so reading it back here needs a cast through `unknown`.
  function translateYOf(style: unknown): number | undefined {
    const transform = (style as { transform: ReadonlyArray<Record<string, number>> }).transform;
    return transform.find((entry) => 'translateY' in entry)?.translateY;
  }

  it('animates away from the resting frame once the shared clock advances (full motion, focused)', async () => {
    const { result, rerender } = await renderHook(() => useLoop('bob'));
    await act(() => {
      jest.advanceTimersByTime(1200); // half of bob's 2400ms cycle
    });
    await rerender(undefined);
    expect(translateYOf(result.current)).toBeCloseTo(-6, 0);
  });

  it('renders the static resting frame when the effective motion mode is not "full"', async () => {
    const { result, rerender } = await renderHook(() => useLoopHarness('bob'));
    await act(() => {
      result.current.setMotionMode('reduced');
    });
    await rerender(undefined);
    expect(translateYOf(result.current.style)).toBe(0);

    await act(() => {
      jest.advanceTimersByTime(1200);
    });
    await rerender(undefined);
    expect(translateYOf(result.current.style)).toBe(0);
  });

  it('pauses on the resting frame while the screen is unfocused', async () => {
    mockedUseIsFocused.mockReturnValue(false);
    const { result, rerender } = await renderHook(() => useLoop('bob'));
    await act(() => {
      jest.advanceTimersByTime(1200);
    });
    await rerender(undefined);
    expect(translateYOf(result.current)).toBe(0);
  });
});

describe('useSharedClock', () => {
  let addEventListenerSpy: jest.SpiedFunction<typeof AppState.addEventListener>;
  let appStateListeners: Array<(state: AppStateStatus) => void>;

  beforeEach(() => {
    jest.useFakeTimers();
    appStateListeners = [];
    addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        appStateListeners.push(handler);
        const subscription: NativeEventSubscription = { remove: () => undefined };
        return subscription;
      });
    motionFreeze.value = false; // reset the module-level singleton between tests
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    jest.useRealTimers();
  });

  it('starts at 0 and advances as fake time passes', async () => {
    const { result } = await renderHook(() => useSharedClock());
    expect(result.current.value).toBe(0);
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.value).toBeGreaterThan(900);
    expect(result.current.value).toBeLessThanOrEqual(1000);
  });

  it('stops advancing while the app is backgrounded and resumes once active again', async () => {
    const { result } = await renderHook(() => useSharedClock());
    await act(() => {
      jest.advanceTimersByTime(160);
    });
    const valueBeforeBackground = result.current.value;
    expect(valueBeforeBackground).toBeGreaterThan(0);

    await act(() => {
      appStateListeners.forEach((listener) => listener('background'));
      jest.advanceTimersByTime(160);
    });
    expect(result.current.value).toBe(valueBeforeBackground);

    await act(() => {
      appStateListeners.forEach((listener) => listener('active'));
      jest.advanceTimersByTime(160);
    });
    expect(result.current.value).toBeGreaterThan(valueBeforeBackground);
  });

  it('stops advancing in motion-freeze mode', async () => {
    const { result } = await renderHook(() => useSharedClock());
    await act(() => {
      jest.advanceTimersByTime(160);
    });
    const valueBeforeFreeze = result.current.value;

    setMotionFreeze(true);
    await act(() => {
      jest.advanceTimersByTime(160);
    });
    expect(result.current.value).toBe(valueBeforeFreeze);

    setMotionFreeze(false);
    await act(() => {
      jest.advanceTimersByTime(160);
    });
    expect(result.current.value).toBeGreaterThan(valueBeforeFreeze);
  });
});
