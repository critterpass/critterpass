import { EncounterScreen } from '@/features/critters/encounter/encounter-screen';
import { PremiumEncounterScreen } from '@/features/critters/premium/encounter/encounter-screen';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentEncounterRoute() {
  return <EncounterScreen />;
}

/**
 * An encounter (3l-4, 3l-5, 3l-6, 3l-10). There is one at a time: the screen follows the
 * session's encounter engine, so the id only names it for links.
 */
export default premiumRoute({ premium: PremiumEncounterScreen, legacy: CurrentEncounterRoute });
