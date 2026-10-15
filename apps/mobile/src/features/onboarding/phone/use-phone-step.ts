/**
 * The phone page's working state, shared by the current and the premium page: the number and code
 * steps (`usePhoneFlow`), the save flow they feed, the returning sign-in's restart, and what a
 * saved or switched pass leads to (back to the page that asked for a number, the name page for a
 * returning number with no pass yet, or a restart on the old pass).
 */
import { getLocales } from 'expo-localization';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { homeBaseFor } from '@cp/domain';

import { deviceLastUid } from '@/data/app-session/last-uid-store';

import { airportDataset } from '../content';
import { markOnboardingComplete } from '../flow-controller/completion';
import { readDraft, updateDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { useSaveFlow } from '../save/use-save-flow';
import { useOnboardingServices } from '../services';
import { defaultCountry } from './phone-number';
import { usePhoneFlow } from './use-phone-flow';

/** From the last digit landing to moving on (3a-8: ring at 1350 ms, auto-advance at 2150 ms). */
export const PHONE_ADVANCE_MS = 2150;

export function usePhoneStep() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const returning = params.mode === 'returning';
  useTrackStep('phone', returning ? 'returning' : 'new');
  const services = useOnboardingServices();
  const flow = useSaveFlow();
  const draft = readDraft();
  const home = draft?.home_iata ? homeBaseFor(airportDataset(), draft.home_iata) : null;
  const phone = usePhoneFlow(
    {
      auth: services.auth,
      save: flow,
      // Signed in to the pass this number holds: the app starts again on that account, at Home.
      returning: returning
        ? {
            onSignedIn: (userId) => {
              // The restart opens this account's data straight away, not the fresh pass's first.
              deviceLastUid.write(userId);
              setTimeout(() => {
                markOnboardingComplete();
                services.restart();
              }, PHONE_ADVANCE_MS);
            },
          }
        : undefined,
    },
    defaultCountry(home?.country ?? null, getLocales()[0]?.regionCode ?? null),
  );
  const [picking, setPicking] = useState(false);

  // Saved (or switched) → move on.
  useEffect(() => {
    const state = flow.state;
    if (state.kind === 'saved') {
      if (returning) {
        // No pass on this number yet: it is now this phone's account; make the pass.
        const timer = setTimeout(() => router.replace(ONBOARDING_ROUTES.name), PHONE_ADVANCE_MS);
        return () => clearTimeout(timer);
      }
      // The page that asked for a number decides what a saved pass leads to (the permissions page,
      // or a seat in the crew that invited them): after the clap, back to it.
      updateDraft((d) => ({ ...d, saved: true }));
      const timer = setTimeout(() => router.back(), PHONE_ADVANCE_MS);
      return () => clearTimeout(timer);
    }
    if (state.kind === 'switched') {
      // "Use my old pass": the app starts again on that account, like a returning sign-in.
      markOnboardingComplete();
      services.restart();
    }
    return undefined;
  }, [flow.state, returning, services]);

  return {
    returning,
    services,
    flow,
    phone,
    picking,
    openPicker: () => setPicking(true),
    pickCountry: (next: string) => {
      phone.setCountry(next);
      setPicking(false);
    },
    closePicker: () => setPicking(false),
    /** "Keep this new pass" on the merge choice: the number stays with the old pass. */
    keepNew: () => {
      flow.keepThisPass();
      phone.changeNumber();
    },
  };
}
