import { usePlanScreen } from '../plan/use-plan-screen';
import { PlanPremiumView } from './plan-premium-view';

/** Your plan (9.17) over the synced plan and the store. */
export function PlanPremium() {
  return <PlanPremiumView props={usePlanScreen()} />;
}
