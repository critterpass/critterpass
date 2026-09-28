/**
 * 3a-9 "Three things, and why": the permission primer cards (alarms and pings, location on trips,
 * calendar). LET'S GO and "Ask me later" both finish onboarding; a link that arrived before the
 * pass existed opens now instead of Home.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { PermissionsPrimer } from '@/ui/permission-primer';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';

import { completeOnboarding } from '../flow-controller/completion';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { useAnalytics } from '@/lib/analytics';

export function PermissionsStep() {
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
  return (
    <PermissionsPrimer
      guide="tokek"
      guideName={GUIDE_STICKERS.tokek.name}
      onDone={finish}
      onLater={finish}
      onBack={() => router.replace(ONBOARDING_ROUTES.issued)}
    />
  );
}
