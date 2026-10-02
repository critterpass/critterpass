import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useMMKVString } from 'react-native-mmkv';

export type MotionMode = 'full' | 'reduced' | 'off';

// eslint-disable-next-line lingui/no-unlocalized-strings -- an MMKV storage key, never rendered copy.
const MOTION_MODE_KEY = 'cp.motion.mode';

function isMotionMode(value: string | undefined): value is MotionMode {
  return value === 'full' || value === 'reduced' || value === 'off';
}

const RESTRICTION_RANK: Record<MotionMode, number> = { full: 0, reduced: 1, off: 2 };

/**
 * The more restrictive of the OS "Reduce Motion" accessibility setting and the user's in-app
 * override always wins (docs/design-system.md §5): an in-app "off" stays "off" even if the OS
 * setting is disabled, and OS "Reduce Motion" floors an in-app "full" to "reduced".
 */
export function combineMotionMode(
  osReduceMotionEnabled: boolean,
  inAppMode: MotionMode,
): MotionMode {
  const osFloor: MotionMode = osReduceMotionEnabled ? 'reduced' : 'full';
  return RESTRICTION_RANK[inAppMode] >= RESTRICTION_RANK[osFloor] ? inAppMode : osFloor;
}

/**
 * The OS "Reduce Motion" setting as last read, shared by every caller: a screen or navigator that
 * mounts after it was read starts on it. Each caller reading it afresh would start on full motion
 * and switch after mounting, and a stack that switches its transitions with a screen already
 * covered leaves that screen where full motion had slid it (part-way off to the left).
 */
let osReduceMotion: boolean | undefined;
const osListeners = new Set<() => void>();

function setOsReduceMotion(enabled: boolean): void {
  if (enabled === osReduceMotion) return;
  osReduceMotion = enabled;
  osListeners.forEach((listener) => listener());
}

function subscribeOsReduceMotion(listener: () => void): () => void {
  osListeners.add(listener);
  return () => osListeners.delete(listener);
}

/** Forgets the OS setting read so far, so a test starts from an app that has not read it yet. */
export function forgetOsReduceMotionForTests(): void {
  osReduceMotion = undefined;
}

/**
 * Combines the OS setting with the in-app override (`cp.motion.mode` in MMKV, the "You" phase's
 * 3n-7 settings screen writes it via the returned setter). Defaults to `'full'` until the OS
 * setting is first read and when no in-app override has been saved yet.
 */
export function useMotionMode(): [MotionMode, (mode: MotionMode) => void] {
  const osReduceMotionEnabled = useSyncExternalStore(
    subscribeOsReduceMotion,
    () => osReduceMotion === true,
  );
  const [storedMode, setStoredMode] = useMMKVString(MOTION_MODE_KEY);

  useEffect(() => {
    let isMounted = true;
    // Wrapped in `Promise.resolve` rather than called bare: some test/native-mock environments
    // return `undefined` instead of a real promise, which would otherwise throw synchronously here
    // (before `.catch` below ever gets a chance to run) instead of just falling back to "motion on".
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .then((enabled) => {
        if (isMounted) setOsReduceMotion(enabled === true);
      })
      .catch(() => {
        // Platforms without the accessibility service (or a misbehaving one) keep the default: motion on.
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setOsReduceMotion(enabled === true),
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const inAppMode = isMotionMode(storedMode) ? storedMode : 'full';
  const mode = combineMotionMode(osReduceMotionEnabled, inAppMode);
  const setMode = (next: MotionMode) => setStoredMode(next);
  return [mode, setMode];
}
