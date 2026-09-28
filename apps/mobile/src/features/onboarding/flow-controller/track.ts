import type { AnalyticsEventProps } from '@cp/domain';

import { useAnalytics } from '@/lib/analytics';
import { useEffect } from 'react';

export type OnboardingStepName = AnalyticsEventProps<'onboarding_step'>['step'];

/** One funnel event per step reached (resumed steps count again: that is a real re-entry). */
export function useTrackStep(step: OnboardingStepName, path: 'new' | 'returning' = 'new'): void {
  const analytics = useAnalytics();
  useEffect(() => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
    analytics.capture('onboarding_step', { step, path });
  }, [analytics, step, path]);
}
