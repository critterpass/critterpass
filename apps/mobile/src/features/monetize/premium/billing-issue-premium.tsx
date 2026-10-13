import { useRecheckOnReturn } from '../plan/use-billing-issue';
import { usePlan } from '../plan/use-plan';
import { BillingIssuePremiumView } from './billing-issue-premium-view';

/** The card didn't go through (9.24) over the synced plan; coming back from the store re-checks. */
export function BillingIssuePremium() {
  const { plan, boosts, restore, recheck, manage } = usePlan();
  useRecheckOnReturn(recheck);
  return (
    <BillingIssuePremiumView
      plan={plan}
      boosts={boosts}
      checking={restore.status === 'restoring'}
      onUpdate={manage}
      onTryAgain={recheck}
    />
  );
}
