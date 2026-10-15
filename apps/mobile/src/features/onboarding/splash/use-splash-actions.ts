/**
 * The splash's ways in: open a pass (the draft starts here, and a second tap while page one is on
 * its way opens nothing more), type an invite code, sign in to a pass made before, and, outside
 * production, the developer tools.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and build variants, never copy. */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useRef } from 'react';

import { CODE_ENTRY_ROUTE } from '@/lib/links/route-map';

import { onboardingCues } from '../cues';
import { ensureDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';

const DEV_TOOLS_ROUTE = '/(dev)';
/** How long a tap on Open waits out a second one: page one's push is on its way. */
const OPEN_GUARD_MS = 1000;
const RETURNING_SIGN_IN = `${ONBOARDING_ROUTES.phone}?mode=returning`;

function appVariant(): string {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return typeof raw === 'string' ? raw : 'development';
}

export function useSplashActions() {
  useTrackStep('splash');
  const openedAt = useRef(0);
  return {
    open: () => {
      const now = Date.now();
      if (now - openedAt.current < OPEN_GUARD_MS) return;
      openedAt.current = now;
      onboardingCues.softThud();
      onboardingCues.page();
      ensureDraft();
      router.push(ONBOARDING_ROUTES.name);
    },
    inviteCode: () => router.push(CODE_ENTRY_ROUTE),
    signIn: () => router.push(RETURNING_SIGN_IN),
    devTools: appVariant() === 'production' ? null : () => router.push(DEV_TOOLS_ROUTE),
  };
}
