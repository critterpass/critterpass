import { usePaywallScreen } from '../paywall/use-paywall-screen';
import { PaywallPremiumView } from './paywall-premium-view';

/** Pass+ paywall (9.10) over the store and the synced plan. */
export function PaywallPremium() {
  const screen = usePaywallScreen();
  return <PaywallPremiumView {...screen} />;
}
