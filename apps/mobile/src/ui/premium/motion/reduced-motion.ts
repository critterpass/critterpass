/**
 * Whether premium motion runs reduced: the phone's Reduce Motion, or the in-app motion setting at
 * "reduced" or "off" (the same stored setting the motion settings screen writes). Reduced motion
 * turns every spring into a 150 ms cross-fade; stamps still land, without the fall.
 */
import { useReducedMotion } from 'react-native-reanimated';
import { useMMKVString } from 'react-native-mmkv';

// eslint-disable-next-line lingui/no-unlocalized-strings -- the stored motion setting's key, never rendered copy.
const IN_APP_MOTION_KEY = 'cp.motion.mode';

/** `true` when the OS asks for less motion or the in-app setting is reduced or off. */
export function reducedMotion(osReduced: boolean, inApp: string | undefined): boolean {
  return osReduced || inApp === 'reduced' || inApp === 'off';
}

export function usePremiumReducedMotion(): boolean {
  const osReduced = useReducedMotion();
  const [inApp] = useMMKVString(IN_APP_MOTION_KEY);
  return reducedMotion(osReduced, inApp);
}
