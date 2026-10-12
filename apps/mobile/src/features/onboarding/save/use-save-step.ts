/**
 * The save page's working state, shared by the current and the premium page: the save flow, what
 * happens once it lands (saved: on to the permissions page, or back to where an in-app visit came
 * from; switched: the app restarts on the existing pass), "Not now", and the phone way in.
 */
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

import { isOnboardingComplete } from '@/lib/links/pending';

import { markOnboardingComplete } from '../flow-controller/completion';
import { updateDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { useOnboardingServices } from '../services';
import { markReturningInstall } from '../splash/returning-marker';
import { useSaveFlow } from './use-save-flow';

/** Long enough for the SAVED tick to pop (300 ms delay + pop) before the page moves on. */
export const SAVED_ADVANCE_MS = 900;

const HOME = '/';

export function useSaveStep() {
  useTrackStep('save');
  const flow = useSaveFlow();
  const services = useOnboardingServices();
  const { state } = flow;
  // The phone page is pushed over this one: the sheet goes while it is up and rises again on the
  // way back.
  const focused = useIsFocused();
  // Read once: the page leaves the same way it was entered.
  const [outside] = useState(isOnboardingComplete);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(HOME));

  useEffect(() => {
    // While the phone page is up it is the one that reacts; this page moves on once it is back.
    if (!focused) return undefined;
    if (state.kind === 'saved') {
      markReturningInstall();
      updateDraft((d) => ({ ...d, saved: true, step: 'saved' }));
      const timer = setTimeout(
        () => (outside ? goBack() : router.replace(ONBOARDING_ROUTES.permissions)),
        SAVED_ADVANCE_MS,
      );
      return () => clearTimeout(timer);
    }
    if (state.kind === 'switched') {
      markReturningInstall();
      markOnboardingComplete();
      services.restart();
    }
    return undefined;
  }, [state, focused, outside, services]);

  const notNow = () => {
    if (outside) {
      goBack();
      return;
    }
    updateDraft((d) => ({ ...d, step: 'saved' }));
    router.replace(ONBOARDING_ROUTES.permissions);
  };

  return {
    flow,
    state,
    focused,
    notNow,
    phone: () => router.push(ONBOARDING_ROUTES.phone),
  };
}
