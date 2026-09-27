import { useEffect, useState } from 'react';
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
 * Combines the OS setting with the in-app override (`cp.motion.mode` in MMKV, the "You" phase's
 * 3n-7 settings screen writes it via the returned setter). Defaults to `'full'` before the OS
 * setting resolves and when no in-app override has been saved yet.
 */
export function useMotionMode(): [MotionMode, (mode: MotionMode) => void] {
  const [osReduceMotionEnabled, setOsReduceMotionEnabled] = useState(false);
  const [storedMode, setStoredMode] = useMMKVString(MOTION_MODE_KEY);

  useEffect(() => {
    let isMounted = true;
    // Wrapped in `Promise.resolve` rather than called bare: some test/native-mock environments
    // return `undefined` instead of a real promise, which would otherwise throw synchronously here
    // (before `.catch` below ever gets a chance to run) instead of just falling back to "motion on".
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .then((enabled) => {
        if (isMounted) setOsReduceMotionEnabled(enabled === true);
      })
      .catch(() => {
        // Platforms without the accessibility service (or a misbehaving one) keep the default: motion on.
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setOsReduceMotionEnabled,
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
