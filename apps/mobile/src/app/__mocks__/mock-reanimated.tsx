import { View } from 'react-native';

// react-native-reanimated needs the native Worklets JSI runtime to even load — under this repo's
// current Jest preset that's true even of the package's own documented mock.js, which still pulls
// in the native initializer transitively. This is a minimal local double for just the exports the
// spike screens use (code-standards.md §17: native-runtime boundary, same class as mock-skia.tsx).
export function useSharedValue<T>(initial: T): { value: T } {
  return { value: initial };
}

export function useFrameCallback(): { setActive: (active: boolean) => void } {
  return { setActive: () => {} };
}

export function runOnJS<Args extends unknown[], Result>(fn: (...args: Args) => Result): (...args: Args) => Result {
  return fn;
}

export function useAnimatedStyle<T extends Record<string, unknown>>(factory: () => T): T {
  return factory();
}

export function withRepeat<T>(value: T): T {
  return value;
}

export function withSequence<T>(first: T, ..._rest: T[]): T {
  return first;
}

export function withTiming<T>(value: T): T {
  return value;
}

const Animated = { View };
export default Animated;
