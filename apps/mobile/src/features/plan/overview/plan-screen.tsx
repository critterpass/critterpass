/** The `/{tripId}/plan` route's screen: the overview (3e-1). */
import { PlanOverviewScreen } from './plan-overview-screen';

export function PlanScreen({ tripId }: { readonly tripId: string }) {
  return <PlanOverviewScreen tripId={tripId} />;
}
