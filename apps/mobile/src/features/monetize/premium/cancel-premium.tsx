import { useCancelScreen } from '../plan/use-cancel-screen';
import { CancelPremiumView } from './cancel-premium-view';

/** Before you go (9.23) over the synced plan. */
export function CancelPremium() {
  return <CancelPremiumView props={useCancelScreen()} />;
}
