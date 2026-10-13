import { StampsScreen } from '@/features/you/history/stamps-screen';
import { StampsPremiumView } from '@/features/you/premium/history/stamps-premium-view';
import { premiumRoute } from '@/lib/premium-ui';

function PremiumStampsRoute() {
  return <StampsScreen View={StampsPremiumView} />;
}

function StampsRoute() {
  return <StampsScreen />;
}

export default premiumRoute({ premium: PremiumStampsRoute, legacy: StampsRoute });
