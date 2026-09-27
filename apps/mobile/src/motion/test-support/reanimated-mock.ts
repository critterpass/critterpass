// Manual Jest mock for `react-native-reanimated`, mapped in this package's `jest.config.js`
// (`moduleNameMapper`). Its own shipped `/mock` re-exports several names (`FlatList`, `ScrollView`,
// layout-animation builders) from its real entry point, which at 4.7.0 unconditionally reaches
// `createAnimatedComponent`'s web/DOM layout-animation code — `document`/`window.matchMedia` do not
// exist in React Native's Jest environment, so that import throws before a single test runs
// (github.com/software-mansion/react-native-reanimated/discussions/8806, open at the time of
// writing). None of this package's motion code uses `Animated.FlatList`/`Animated.ScrollView`, so
// this mock only reimplements the subset actually used: shared values, `useAnimatedStyle`/`Props`,
// `useDerivedValue`, `useFrameCallback` (driven by real timers so `jest.advanceTimersByTime` moves
// it, unlike the upstream mock's inert stub) and the `withX` animation builders (each resolves to
// its target value immediately, same as the upstream mock, since nothing here asserts on
// intermediate animation frames — only on the settled value and on `useFrameCallback`-driven state).
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

type Listener<Value> = (value: Value) => void;

interface MutableValue<Value> {
  value: Value;
  addListener: (id: number, listener: Listener<Value>) => void;
  removeListener: (id: number) => void;
}

function makeMutable<Value>(initial: Value): MutableValue<Value> {
  let current = initial;
  const listeners = new Map<number, Listener<Value>>();
  return {
    get value() {
      return current;
    },
    set value(next) {
      current = next;
      for (const listener of listeners.values()) listener(next);
    },
    addListener: (id, listener) => listeners.set(id, listener),
    removeListener: (id) => listeners.delete(id),
  };
}

function useSharedValue<Value>(initial: Value): MutableValue<Value> {
  const [mutable] = useState(() => makeMutable(initial));
  return mutable;
}

function useAnimatedStyle<Style>(factory: () => Style): Style {
  return factory();
}

function useDerivedValue<Value>(processor: () => Value): { value: Value } {
  return {
    get value() {
      return processor();
    },
  };
}

interface FrameInfo {
  timestamp: number;
  timeSincePreviousFrame: number | null;
  timeSinceFirstFrame: number;
}

interface FrameCallbackHandle {
  setActive: (active: boolean) => void;
  readonly isActive: boolean;
}

const MOCK_FRAME_MS = 16;

/**
 * Ticks on a real `setInterval`, so `jest.useFakeTimers()` + `jest.advanceTimersByTime(ms)` drives
 * it deterministically (unlike the upstream mock's `useFrameCallback`, which never invokes its
 * callback at all).
 */
function useFrameCallback(
  callback: (frameInfo: FrameInfo) => void,
  autostart = true,
): FrameCallbackHandle {
  const activeRef = useRef(autostart);
  const callbackRef = useRef(callback);
  const firstFrameAtRef = useRef<number | null>(null);
  const previousFrameAtRef = useRef<number | null>(null);

  // Keeps the latest callback available to the interval below without restarting it on every
  // render (the standard "ref mirrors the latest prop/closure" pattern, done in an effect — never
  // during render itself).
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeRef.current) return;
      const now = Date.now();
      firstFrameAtRef.current ??= now;
      const timeSincePreviousFrame =
        previousFrameAtRef.current === null ? null : now - previousFrameAtRef.current;
      previousFrameAtRef.current = now;
      callbackRef.current({
        timestamp: now,
        timeSincePreviousFrame,
        timeSinceFirstFrame: now - firstFrameAtRef.current,
      });
    }, MOCK_FRAME_MS);
    return () => clearInterval(interval);
  }, []);

  return {
    setActive: (active: boolean) => {
      activeRef.current = active;
    },
    get isActive() {
      return activeRef.current;
    },
  };
}

type AnimationCallback = (finished: boolean) => void;

function resolveAnimation<Value>(toValue: Value, callback?: AnimationCallback): Value {
  callback?.(true);
  return toValue;
}

function withTiming<Value>(toValue: Value, _config?: unknown, callback?: AnimationCallback): Value {
  return resolveAnimation(toValue, callback);
}

function withSpring<Value>(toValue: Value, _config?: unknown, callback?: AnimationCallback): Value {
  return resolveAnimation(toValue, callback);
}

function withDelay<Value>(_delayMs: number, animation: Value): Value {
  return animation;
}

function withRepeat<Value>(
  animation: Value,
  _numberOfReps?: number,
  _reverse?: boolean,
  callback?: AnimationCallback,
): Value {
  return resolveAnimation(animation, callback);
}

function withSequence<Value>(...animations: readonly Value[]): Value {
  const last = animations[animations.length - 1];
  if (last === undefined) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error('withSequence (mock) requires at least one animation');
  }
  return last;
}

function cancelAnimation(): void {
  // No pending animation ever exists in this mock (withX resolves synchronously).
}

/**
 * `createAnimatedComponent` normally wraps a host component so it accepts the opaque style handle
 * `useAnimatedStyle` returns. This mock's `useAnimatedStyle` already resolves to a plain style
 * object, so the identity function is a faithful stand-in — react-native-gesture-handler's own
 * `GestureDetector`/`Text` (reached transitively by importing `Gesture` from
 * `react-native-gesture-handler`, `src/motion/gestures/*`'s only import from that package) calls
 * this at module-load time, so it must be a real function, not merely absent.
 */
function createAnimatedComponent<Component>(component: Component): Component {
  return component;
}

// The real module's default export is the `Animated` namespace (`Animated.View`, `.Text`, ...): each
// is normally a `createAnimatedComponent`-wrapped host component that accepts the opaque style handle
// `useAnimatedStyle` returns. This mock's `useAnimatedStyle` already resolves to a plain style object
// (see above), so a plain host component is a faithful stand-in — only `View` is reimplemented here
// since it is the only one this package's motion code renders directly.
const Animated = { View, createAnimatedComponent };

module.exports = {
  __esModule: true,
  default: Animated,
  createAnimatedComponent,
  makeMutable,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps: useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  cancelAnimation,
};
