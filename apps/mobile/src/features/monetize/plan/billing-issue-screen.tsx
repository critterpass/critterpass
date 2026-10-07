/**
 * The payment didn't go through (4d-3). Updating the payment happens in the store; coming back to
 * the app, or "Try again", has the server re-check the subscription with the store.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { MONETIZE_ROUTES } from '../routes';
import { BillingIssueView } from './billing-issue-view';
import { usePlan } from './use-plan';

export function BillingIssueScreen() {
  const { plan, boosts, restore, recheck, manage } = usePlan();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => subscription.remove();
  }, [recheck]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(MONETIZE_ROUTES.plan));
  if (plan === null) return null;
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
