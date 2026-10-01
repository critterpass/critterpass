/**
 * Whether this build carries Developer tools: every variant except production (whose bundle drops
 * the `(dev)` routes). Staging counts: its Home hides the link from testers, so the shake is the
 * way in there.
 */
import Constants from 'expo-constants';

export function devToolsAvailable(): boolean {
  if (__DEV__) return true;
  const variant: unknown = Constants.expoConfig?.extra?.appVariant;
  return variant !== 'production';
}
