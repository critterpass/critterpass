/** Your plan (4d-1) on the current UI. */
import { PlanView } from './plan-view';
import { usePlanScreen } from './use-plan-screen';

export function PlanScreen() {
  return <PlanView {...usePlanScreen()} />;
}
