/**
 * The banner Home and the profile show while a Pass+ renewal has failed: it says whether Pass+ is
 * still on and opens the page that fixes it. It renders nothing otherwise.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { Banner } from '@/ui/premium';

import { MONETIZE_ROUTES } from '../routes';
import type { PlanModel } from './plan-model';
import { useBillingIssue } from './use-billing-issue';

export function BillingIssueBannerView(props: {
  readonly plan: PlanModel | null;
  readonly onPress: () => void;
}) {
  const { t } = useLingui();
  if (props.plan === null || !props.plan.hasIssue) return null;
  return (
    <Banner
      tone="error"
      text={t({ id: 'monetize.issue.banner', message: 'Your Pass+ payment needs a look' })}
      action={{
        label: t({ id: 'monetize.plan.fixPayment', message: 'Fix the payment' }),
        onPress: props.onPress,
      }}
      testID="billing-issue-banner"
    />
  );
}

export function BillingIssueBanner() {
  const plan = useBillingIssue();
  return (
    <BillingIssueBannerView plan={plan} onPress={() => router.push(MONETIZE_ROUTES.billingIssue)} />
  );
}
