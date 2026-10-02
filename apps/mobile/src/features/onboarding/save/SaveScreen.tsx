/**
 * The 3a-7 route: the finished pass with the save sheet over it. Saved → SAVED tick, then on to
 * the permissions page; "Use that pass" → the app starts again on the existing pass's account, at
 * Home (its session and its data, not the new pass's).
 */
import { router, useIsFocused } from 'expo-router';
import { useEffect } from 'react';

import { useAnalytics } from '@/lib/analytics';

import { markOnboardingComplete } from '../flow-controller/completion';
import { updateDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { IssuedPage } from '../issued/IssuedScreen';
import { useOnboardingServices } from '../services';
import { SaveSheet } from './SaveSheet';
import { useSaveFlow } from './use-save-flow';

/** Long enough for the SAVED tick to pop (300 ms delay + pop) before the page moves on. */
export const SAVED_ADVANCE_MS = 900;

export function SaveScreen() {
  useTrackStep('save');
  const flow = useSaveFlow();
  const services = useOnboardingServices();
  const analytics = useAnalytics();
  const { state } = flow;
  // The phone page is pushed over this one: the sheet goes while it is up (so the presenter scale
  // is released) and rises again on the way back.
  const focused = useIsFocused();

  useEffect(() => {
    if (state.kind === 'saved') {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
      analytics.capture('account_saved', { provider: state.provider });
      updateDraft((d) => ({ ...d, saved: true, step: 'saved' }));
      const timer = setTimeout(
        () => router.replace(ONBOARDING_ROUTES.permissions),
        SAVED_ADVANCE_MS,
      );
      return () => clearTimeout(timer);
    }
    if (state.kind === 'switched') {
      markOnboardingComplete();
      services.restart();
    }
    return undefined;
  }, [state, analytics, services]);

  const notNow = () => {
    updateDraft((d) => ({ ...d, step: 'saved' }));
    router.replace(ONBOARDING_ROUTES.permissions);
  };

  return (
    <>
      <IssuedPage choreography={false} saved={state.kind === 'saved'} />
      {state.kind === 'saved' || !focused ? null : (
        <SaveSheet
          state={state}
          onApple={() => void flow.apple()}
          onGoogle={() => void flow.google()}
          onPhone={() => router.push(ONBOARDING_ROUTES.phone)}
          onNotNow={notNow}
          onUseExisting={() => void flow.confirmSwitch()}
          onKeepNew={flow.keepThisPass}
          onKeptDone={flow.closeKept}
          onReopenMerge={flow.reopenMerge}
        />
      )}
    </>
  );
}
