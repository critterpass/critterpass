import { StampsScreen } from '@/features/you/history/stamps-screen';
import { StampsPremiumView } from '@/features/you/premium/history/stamps-premium-view';

export default function StampsRoute() {
  return <StampsScreen View={StampsPremiumView} />;
}
