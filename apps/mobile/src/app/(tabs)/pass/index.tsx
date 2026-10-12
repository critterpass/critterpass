import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { PassScreen } from '@/features/critters/dex/pass-screen';
import { ProfilePremiumScreen } from '@/features/you/premium/profile/profile-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** The PASS tab (3l-2): the Critterdex. */
function LegacyPassRoute() {
  return (
    <LocalFirstGate>
      <PassScreen />
    </LocalFirstGate>
  );
}

/**
 * The premium PASS tab (9.01): the passport page, with the Critterdex a row away. The premium tab
 * bar mounts it at launch, before the local database is open, so it waits for it.
 */
function PremiumPassRoute() {
  return (
    <LocalFirstGate>
      <ProfilePremiumScreen />
    </LocalFirstGate>
  );
}

export default premiumRoute({ premium: PremiumPassRoute, legacy: LegacyPassRoute });
