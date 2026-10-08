jest.mock('../../feedback', () => ({ impact: jest.fn() }));
jest.mock('../../../../modules/cp-haptics', () => ({
  ramp: { start: jest.fn(), update: jest.fn(), stop: jest.fn() },
}));

import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// `apps/mobile/modules/cp-haptics` isn't yet classified in `tools/lint/boundaries.js` (owned by an
// earlier phase) — see `gestures/hold-fill.ts`'s own comment on this pre-existing gap.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { ramp } from '../../../../modules/cp-haptics';
import { impact } from '../../feedback';
import {
  commitsDragDismiss,
  DRAG_DISMISS_COMMIT_DISTANCE_PT,
  useDragDismiss,
} from '../drag-dismiss';
import { snapMinutes, SNAP_MINUTES, useDragSnap } from '../drag-snap';
import { HOLD_FILL_MS, useHoldFill } from '../hold-fill';
import { LONG_PRESS_DURATION_MS, useLongPress } from '../long-press';
import { PRESS_CANCEL_DISTANCE_PT, PRESS_MAX_DURATION_MS, usePress } from '../press';
import {
  commitsSlideToConfirm,
  SLIDE_TO_CONFIRM_COMMIT_FRACTION,
  useSlideToConfirm,
} from '../slide-to-confirm';
import { commitsFling, FLING_COMMIT_DISTANCE_PT, useSwipeDeck } from '../swipe-deck';
import { useMotionMode } from '../../motion-mode';
import { resetMotionModeForTests } from '../../test-support/reset-motion-mode';

const mockedImpact = impact as jest.MockedFunction<typeof impact>;
const mockedRampStart = ramp.start as jest.MockedFunction<typeof ramp.start>;

beforeEach(async () => {
  await resetMotionModeForTests();
  jest.clearAllMocks();
});

describe('commit thresholds', () => {
  it('fling commits at exactly 110 pt and beyond, not below', () => {
    expect(commitsFling(FLING_COMMIT_DISTANCE_PT)).toBe(true);
    expect(commitsFling(-FLING_COMMIT_DISTANCE_PT)).toBe(true);
    expect(commitsFling(FLING_COMMIT_DISTANCE_PT - 1)).toBe(false);
  });

  it('slide-to-confirm commits at 70% and above, not below', () => {
    expect(commitsSlideToConfirm(SLIDE_TO_CONFIRM_COMMIT_FRACTION)).toBe(true);
    expect(commitsSlideToConfirm(1)).toBe(true);
    expect(commitsSlideToConfirm(SLIDE_TO_CONFIRM_COMMIT_FRACTION - 0.01)).toBe(false);
  });

  it('drag-dismiss commits on distance OR velocity, not either alone below threshold', () => {
    expect(commitsDragDismiss(DRAG_DISMISS_COMMIT_DISTANCE_PT + 1, 0)).toBe(true);
    expect(commitsDragDismiss(0, 0.6)).toBe(true);
    expect(commitsDragDismiss(50, 0.1)).toBe(false);
  });

  it('snaps to the nearest 15-minute increment', () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(SNAP_MINUTES);
    expect(snapMinutes(22)).toBe(SNAP_MINUTES);
    expect(snapMinutes(23)).toBe(2 * SNAP_MINUTES);
  });
});

describe('hold-fill', () => {
  it('starts the cp-haptics ramp and fills to completion over HOLD_FILL_MS', async () => {
    jest.useFakeTimers();
    try {
      const onComplete = jest.fn();
      const { result } = await renderHook(() =>
        useHoldFill({ onComplete, accessibilityLabel: 'Hold to hatch' }),
      );

      await act(() => {
        result.current.gesture.handlers.onStart?.({ state: 4 } as never);
        // `scheduleOnRN` (react-native-worklets) hops to the JS thread via `queueMicrotask`, which
        // fake timers intercept too — flush it before asserting.
        jest.advanceTimersByTime(0);
      });
      expect(mockedRampStart).toHaveBeenCalledTimes(1);

      await act(() => {
        jest.advanceTimersByTime(HOLD_FILL_MS + 50);
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(mockedImpact).toHaveBeenCalledWith('thud.soft');
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes an accessibility action that completes without holding', async () => {
    const onComplete = jest.fn();
    const { result } = await renderHook(() =>
      useHoldFill({ onComplete, accessibilityLabel: 'Hold to hatch' }),
    );
    expect(result.current.accessibilityActions).toEqual([
      { name: 'activate', label: 'Hold to hatch' },
    ]);
    result.current.onAccessibilityAction({
      nativeEvent: { actionName: 'activate' },
    } as never);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('usePress keeps one gesture across renders', () => {
  it('hands back the same gesture when only the handler changes, and calls the newest handler', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = await renderHook(
      ({ onPress }: { onPress: () => void }) => usePress({ onPress, accessibilityLabel: 'Open' }),
      { initialProps: { onPress: first } },
    );
    const gesture = result.current.gesture;
    await rerender({ onPress: second });
    expect(result.current.gesture).toBe(gesture);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } } as never);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('builds a new gesture when the control is disabled', async () => {
    const { result, rerender } = await renderHook(
      ({ disabled }: { disabled: boolean }) => usePress({ disabled, accessibilityLabel: 'Open' }),
      { initialProps: { disabled: false } },
    );
    const gesture = result.current.gesture;
    await rerender({ disabled: true });
    expect(result.current.gesture).not.toBe(gesture);
  });
});

describe('every gesture hook exposes an accessibility action (docs/design-system.md §5)', () => {
  it('usePress', async () => {
    const onPress = jest.fn();
    const { result } = await renderHook(() => usePress({ onPress, accessibilityLabel: 'Confirm' }));
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } } as never);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('useLongPress', async () => {
    const onLongPress = jest.fn();
    const { result } = await renderHook(() =>
      useLongPress({ onLongPress, accessibilityLabel: 'Delete' }),
    );
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } } as never);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('useDragSnap', async () => {
    const onChange = jest.fn();
    const { result } = await renderHook(() =>
      useDragSnap({
        initialMinutes: 540,
        pointsPerMinute: 2,
        onChange,
        accessibilityLabel: 'Start time',
      }),
    );
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } } as never);
    expect(onChange).toHaveBeenCalledWith(540 + SNAP_MINUTES);
  });

  it('useSwipeDeck', async () => {
    const onSwiped = jest.fn();
    const { result } = await renderHook(() =>
      useSwipeDeck({ onSwiped, accessibilityLabel: 'Rate' }),
    );
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'swipeRight' } } as never);
    expect(onSwiped).toHaveBeenCalledWith('right');
  });

  it('useSlideToConfirm', async () => {
    const onConfirm = jest.fn();
    const { result } = await renderHook(() =>
      useSlideToConfirm({ onConfirm, accessibilityLabel: 'Board' }),
    );
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } } as never);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('useDragDismiss', async () => {
    const onDismiss = jest.fn();
    const { result } = await renderHook(() =>
      useDragDismiss({ variant: 'sheet', onDismiss, accessibilityLabel: 'Close' }),
    );
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'dismiss' } } as never);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('useLongPress', () => {
  it('exposes the 320 ms threshold on the underlying gesture config', async () => {
    const { result } = await renderHook(() =>
      useLongPress({ onLongPress: jest.fn(), accessibilityLabel: 'Delete' }),
    );
    expect(LONG_PRESS_DURATION_MS).toBe(320);
    expect(result.current.gesture.config.minDurationMs).toBe(LONG_PRESS_DURATION_MS);
  });
});

describe('usePress', () => {
  it('fires on release however long the press was held, and only movement cancels it', async () => {
    const onPress = jest.fn();
    const { result } = await renderHook(() => usePress({ onPress, accessibilityLabel: 'Confirm' }));
    const { gesture } = result.current;

    // The tap handler's own limit is 500 ms; a deliberate two-second press is well inside ours.
    expect(gesture.config.maxDurationMs).toBe(PRESS_MAX_DURATION_MS);
    expect(PRESS_MAX_DURATION_MS).toBeGreaterThan(2000);
    // The native handlers read the limit as a 32-bit whole number of milliseconds.
    expect(Number.isInteger(PRESS_MAX_DURATION_MS)).toBe(true);
    expect(PRESS_MAX_DURATION_MS).toBeLessThan(2 ** 31);
    expect(gesture.config.maxDist).toBe(PRESS_CANCEL_DISTANCE_PT);

    // Released in place: the handler ends from its active state and the press fires.
    await act(async () => {
      gesture.handlers.onBegin?.({} as never);
      gesture.handlers.onEnd?.({} as never, true);
      gesture.handlers.onFinalize?.({} as never, true);
      await Promise.resolve();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the finger moves past the cancel distance (a scroll, a drag)', async () => {
    const onPress = jest.fn();
    const { result } = await renderHook(() => usePress({ onPress, accessibilityLabel: 'Confirm' }));
    // The handler fails before it activates: it finalizes without ever ending.
    await act(async () => {
      result.current.gesture.handlers.onBegin?.({} as never);
      result.current.gesture.handlers.onFinalize?.({} as never, false);
      await Promise.resolve();
    });
    expect(onPress).not.toHaveBeenCalled();
    const transform = (result.current.animatedStyle as { transform: { scale: number }[] })
      .transform;
    expect(transform[0]?.scale).toBe(1);
  });

  it('gives way to a long-press on the same control: the hold fires, the tap does not', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { result } = await renderHook(() => ({
      press: usePress({ onPress, accessibilityLabel: 'Ask' }),
      hold: useLongPress({ onLongPress, accessibilityLabel: 'Get help' }),
    }));
    const hold = result.current.hold.gesture;
    const tap = result.current.press.gesture.requireExternalGestureToFail(hold);

    // The hold activates at 320 ms, long before the tap's limit, and the tap waits on it.
    expect(hold.config.minDurationMs).toBeLessThan(PRESS_MAX_DURATION_MS);
    expect(tap.config.requireToFail).toEqual([hold]);

    // Held: the long-press starts, and the waiting tap is cancelled without ending.
    await act(async () => {
      tap.handlers.onBegin?.({} as never);
      hold.handlers.onStart?.({} as never);
      tap.handlers.onFinalize?.({} as never, false);
      await Promise.resolve();
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('reduced motion (docs/design-system.md §5)', () => {
  async function setReducedMotion() {
    const { result, unmount } = await renderHook(() => useMotionMode());
    await act(() => {
      result.current[1]('reduced');
    });
    await unmount();
  }

  it('useSwipeDeck drops rotation under reduced motion', async () => {
    await setReducedMotion();
    const { result } = await renderHook(() =>
      useSwipeDeck({ onSwiped: jest.fn(), accessibilityLabel: 'Rate' }),
    );

    await act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 60, translationY: 0 } as never);
    });

    const transform = (result.current.animatedStyle as { transform: { rotate?: string }[] })
      .transform;
    const rotateEntry = transform.find((entry) => 'rotate' in entry);
    expect(rotateEntry?.rotate).toBe('0deg');
  });

  it('usePress settles straight to 1 with no overshoot under reduced motion', async () => {
    await setReducedMotion();
    const onPress = jest.fn();
    const { result } = await renderHook(() => usePress({ onPress, accessibilityLabel: 'Confirm' }));

    await act(async () => {
      result.current.gesture.handlers.onEnd?.({} as never, true);
      await Promise.resolve();
    });

    // Reduced motion settles directly to 1 via a single `withTiming` — no overshoot bounce.
    const transform = (result.current.animatedStyle as { transform: { scale: number }[] })
      .transform;
    expect(transform[0]?.scale).toBe(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
