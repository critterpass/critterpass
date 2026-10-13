import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { ProfilePremiumScreen } from '@/features/you/premium/profile/profile-premium-screen';

/**
 * The PASS tab (9.01): the passport page, with the Critterdex a row away. The tab bar mounts it at
 * launch, before the local database is open, so it waits for it.
 */
export default function PassRoute() {
  return (
    <LocalFirstGate>
      <ProfilePremiumScreen />
    </LocalFirstGate>
  );
}
