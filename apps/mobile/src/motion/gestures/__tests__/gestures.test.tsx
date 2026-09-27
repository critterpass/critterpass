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
import { commitsEdgeSwipe, EDGE_SWIPE_COMMIT_DISTANCE_PT, useEdgeSwipeBack } from '../edge-swipe';
import { HOLD_FILL_MS, useHoldFill } from '../hold-fill';
import { LONG_PRESS_DURATION_MS, useLongPress } from '../long-press';
import { usePress } from '../press';
import { useReorder } from '../reorder';
import {
  commitsSlideToConfirm,
  SLIDE_TO_CONFIRM_COMMIT_FRACTION,
  useSlideToConfirm,
} from '../slide-to-confirm';
import { commitsFling, FLING_COMMIT_DISTANCE_PT, useSwipeDeck } from '../swipe-deck';

const mockedImpact = impact as jest.MockedFunction<typeof impact>;
const mockedRampStart = ramp.start as jest.MockedFunction<typeof ramp.start>;

beforeEach(() => {
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

  it('edge-swipe commits on distance OR velocity, not either alone below threshold', () => {
    expect(commitsEdgeSwipe(EDGE_SWIPE_COMMIT_DISTANCE_PT + 1, 0)).toBe(true);
    expect(commitsEdgeSwipe(0, 0.6)).toBe(true);
    expect(commitsEdgeSwipe(50, 0.1)).toBe(false);
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

  it('useReorder', async () => {
    const onReorder = jest.fn();
    const { result } = await renderHook(() =>
      useReorder({
        index: 1,
        itemCount: 5,
        itemHeightPt: 48,
        onReorder,
        accessibilityLabel: 'Reorder',
      }),
    );
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } } as never);
    expect(onReorder).toHaveBeenCalledWith(1, 2);
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

  it('useEdgeSwipeBack', async () => {
    const onBack = jest.fn();
    const { result } = await renderHook(() =>
      useEdgeSwipeBack({ onBack, accessibilityLabel: 'Back' }),
    );
    expect(result.current.accessibilityActions.length).toBeGreaterThan(0);
    result.current.onAccessibilityAction({ nativeEvent: { actionName: 'escape' } } as never);
    expect(onBack).toHaveBeenCalledTimes(1);
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
