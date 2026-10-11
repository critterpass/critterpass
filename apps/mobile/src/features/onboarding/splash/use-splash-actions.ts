/**
 * The splash's ways in, for the premium splash (the current splash keeps its own passport-opening
 * choreography around the same routes): open a pass (the draft starts here), type an invite code,
 * sign in to a pass made before, and, outside production, the developer tools.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and build variants, never copy. */
import Constants from 'expo-constants';
import { router } from 'expo-router';

import { CODE_ENTRY_ROUTE } from '@/lib/links/route-map';

import { onboardingCues } from '../cues';
import { ensureDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';

const DEV_TOOLS_ROUTE = '/(dev)';
const RETURNING_SIGN_IN = `${ONBOARDING_ROUTES.phone}?mode=returning`;

function appVariant(): string {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return typeof raw === 'string' ? raw : 'development';
}

export function useSplashActions() {
  useTrackStep('splash');
  return {
    open: () => {
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
