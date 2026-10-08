jest.mock('../../feedback', () => ({ impact: jest.fn() }));
jest.mock('../../../../modules/cp-haptics', () => ({
  ramp: { start: jest.fn(), update: jest.fn(), stop: jest.fn() },
}));

import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { resetMotionModeForTests } from '../../test-support/reset-motion-mode';
import { toUIWorklet } from '../../test-support/ui-runtime';
import type { GestureHookResult } from '../shared';
import { useDragDismiss } from '../drag-dismiss';
import { useDragSnap } from '../drag-snap';
import { useHoldFill } from '../hold-fill';
import { useLongPress } from '../long-press';
import { usePress } from '../press';
import { useSlideToConfirm } from '../slide-to-confirm';
import { useSwipeDeck } from '../swipe-deck';

// Gesture callbacks run on the UI runtime on a device, where calling a plain (non-worklet) helper
// throws and aborts the app. Every handler of every gesture kit hook runs here through the same
// rebuild the UI runtime performs, with a short drag and a long fling so both the settle-back and the
// commit branches execute.
const SHORT_DRAG = {
  state: 4,
  x: 4,
  y: 4,
  absoluteX: 4,
  absoluteY: 4,
  translationX: 4,
  translationY: 4,
  velocityX: 0,
  velocityY: 0,
};
const LONG_FLING = {
  state: 5,
  x: 380,
  y: 700,
  absoluteX: 380,
  absoluteY: 700,
  translationX: 380,
  translationY: 700,
  velocityX: 3000,
  velocityY: 3000,
};

type HookUnderTest = () => GestureHookResult;

const noop = () => {};

const HOOKS: readonly (readonly [string, HookUnderTest])[] = [
  [
    'useDragDismiss',
    () => useDragDismiss({ variant: 'sheet', onDismiss: noop, accessibilityLabel: 'Close' }),
  ],
  [
    'useDragSnap',
    () =>
      useDragSnap({
        initialMinutes: 30,
        pointsPerMinute: 2,
        onChange: noop,
        accessibilityLabel: 'Time',
      }),
  ],
  ['useHoldFill', () => useHoldFill({ onComplete: noop, accessibilityLabel: 'Hold to hatch' })],
  ['useLongPress', () => useLongPress({ onLongPress: noop, accessibilityLabel: 'Options' })],
  ['usePress', () => usePress({ onPress: noop, accessibilityLabel: 'Confirm' })],
  [
    'useSlideToConfirm',
    () => useSlideToConfirm({ onConfirm: noop, accessibilityLabel: 'Slide to pay' }),
  ],
  ['useSwipeDeck', () => useSwipeDeck({ onSwiped: noop, accessibilityLabel: 'Rate' })],
];

function uiHandlers(result: GestureHookResult): [string, (...args: unknown[]) => unknown][] {
  const handlers = (result.gesture as { handlers: Record<string, unknown> }).handlers;
  return Object.entries(handlers)
    .filter(
      (entry): entry is [string, (...args: unknown[]) => unknown] =>
        entry[0].startsWith('on') && typeof entry[1] === 'function',
    )
    .map(([name, handler]) => [name, toUIWorklet(handler)]);
}

beforeEach(async () => {
  await resetMotionModeForTests();
  jest.clearAllMocks();
});

describe('gesture kit handlers on the UI runtime', () => {
  it.each(HOOKS)(
    '%s runs every handler without calling a plain JS function',
    async (_name, useHook) => {
      const { result } = await renderHook(useHook);
      const handlers = uiHandlers(result.current);
      expect(handlers.length).toBeGreaterThan(0);

      for (const event of [SHORT_DRAG, LONG_FLING]) {
        await act(async () => {
          for (const [, handler] of handlers) handler(event, true);
          await Promise.resolve();
        });
      }
    },
  );
});
