/**
 * The payment didn't go through (4d-3). Updating the payment happens in the store; coming back to
 * the app, or "Try again", has the server re-check the subscription with the store.
 */
import { useLingui } from '@lingui/react/macro';

import { goBackOr } from '@/lib/navigation/back';
import { ScreenLoading } from '@/ui/states/ScreenLoading';

import { MONETIZE_ROUTES } from '../routes';
import { BillingIssueView } from './billing-issue-view';
import { useRecheckOnReturn } from './use-billing-issue';
import { usePlan } from './use-plan';

export function BillingIssueScreen() {
  const { plan, boosts, restore, recheck, manage } = usePlan();
  const { t } = useLingui();
  useRecheckOnReturn(recheck);
  const back = () => goBackOr(MONETIZE_ROUTES.plan);
  if (plan === null) {
    return (
      <ScreenLoading
        backLabel={t({ id: 'monetize.back.plan', message: 'Your plan' })}
        fallback={MONETIZE_ROUTES.plan}
        testID="billing-issue-loading"
      />
    );
  }
  return (
    <BillingIssueView
      plan={plan}
      boosts={boosts}
      checking={restore.status === 'restoring'}
      canFixHere={plan.manageHere}
      onUpdate={manage}
      onTryAgain={recheck}
      onDone={back}
      onBack={back}
    />
  );
}
