import { HubScreen } from '@/features/help/hub/hub-screen';
import { HelpPremiumScreen } from '@/features/help/premium/help-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Help and feedback (3p-1; premium 9.06). */
function LegacyHelpRoute() {
  return <HubScreen />;
}

export default premiumRoute({ premium: HelpPremiumScreen, legacy: LegacyHelpRoute });
