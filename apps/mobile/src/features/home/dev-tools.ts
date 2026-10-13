/**
 * The "Developer tools" link on Home, in development builds only (the e2e-test build profile ships
 * that variant): Maestro flows reach the `(dev)` screens by tapping it (never `openLink`). Staging
 * testers and production never see it.
 */

import Constants from 'expo-constants';

/** Staging and production builds hide the link; an unset variant is app.config's development. */
export function showsDevTools(): boolean {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return raw !== 'staging' && raw !== 'production';
}
