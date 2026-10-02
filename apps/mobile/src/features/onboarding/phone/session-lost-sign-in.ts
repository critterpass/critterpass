/**
 * Opens the returning sign-in (3a-8, "I have an account") when a start found no session while
 * this phone still holds changes it never sent: signing back in to the same account restarts on
 * it, and the kept changes upload. Once per process, from the session gate; the page itself is
 * unchanged.
 */
import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { sessionLost } from '@/data/app-session/session-lost';

import { ONBOARDING_ROUTES } from '../flow-controller/steps';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never rendered copy.
export const RETURNING_SIGN_IN = `${ONBOARDING_ROUTES.phone}?mode=returning`;

export function useSessionLostSignIn(): void {
  const lost = useSyncExternalStore(sessionLost.subscribe, sessionLost.get);
  useEffect(() => {
    if (lost && sessionLost.claim()) router.push(RETURNING_SIGN_IN);
  }, [lost]);
}
