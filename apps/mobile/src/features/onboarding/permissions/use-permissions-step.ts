/**
 * The last page as a step, shared by the current and the premium page: LET'S GO and "Ask me later"
 * both finish onboarding (once), landing Home or on a link that arrived before the pass existed.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { useAnalytics } from '@/lib/analytics';

import { completeOnboarding } from '../flow-controller/completion';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';

export function usePermissionsStep() {
  useTrackStep('permissions');
  const analytics = useAnalytics();
  const [leaving, setLeaving] = useState(false);
  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
    analytics.capture('onboarding_step', { step: 'done', path: 'new' });
    void completeOnboarding().then((href) => router.replace(href));
  };
  return { finish, leaving, back: () => router.replace(ONBOARDING_ROUTES.issued) };
}
