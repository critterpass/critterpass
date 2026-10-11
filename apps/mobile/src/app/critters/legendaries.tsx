import { LegendaryScreen } from '@/features/critters/legendary/legendary-screen';
import { PremiumLegendaryScreen } from '@/features/critters/premium/legendary/legendary-calendar-screen';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentLegendariesRoute() {
  return <LegendaryScreen />;
}

/** The legendary calendar (3l-9). */
export default premiumRoute({ premium: PremiumLegendaryScreen, legacy: CurrentLegendariesRoute });
