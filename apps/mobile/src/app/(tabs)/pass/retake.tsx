import { Redirect } from 'expo-router';

import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { RetakePremiumSheet } from '@/features/you/premium/profile/retake-premium-sheet';
import { premiumRoute } from '@/lib/premium-ui';

/** Retake "How you travel" from the premium pass, as a form sheet over it. */
function PremiumRetakeRoute() {
  return (
    <LocalFirstGate>
      <RetakePremiumSheet />
    </LocalFirstGate>
  );
}

/** The current UI retakes in its own sheet on the profile; a stray link lands on the pass. */
function LegacyRetakeRoute() {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never copy.
  return <Redirect href="/pass" />;
}

export default premiumRoute({ premium: PremiumRetakeRoute, legacy: LegacyRetakeRoute });
