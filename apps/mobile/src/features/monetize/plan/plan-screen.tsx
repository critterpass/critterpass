/** Your plan (4d-1) over the synced subscription rows and the store. */
import { router } from 'expo-router';

import { useProducts } from '@/data/billing';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { MONETIZE_ROUTES } from '../routes';
import { PlanView } from './plan-view';
import { usePlan } from './use-plan';

/* eslint-disable lingui/no-unlocalized-strings -- a design id and a wire value, never copy. */
const SETTINGS = '3n-2';
const ENTRY = 'plan_page';
/* eslint-enable lingui/no-unlocalized-strings */

export function PlanScreen() {
  const locale = useLocale();
  const { rows, store, plan, boosts, restore, recheck, manage } = usePlan();
  const products = useProducts(store, locale, rows.catalogue);
  const offers = products.status === 'ready' ? products.offers : {};
  const offer =
    plan?.period === 'yearly'
      ? offers.pass_yearly
      : plan?.period === 'monthly'
        ? offers.pass_monthly
        : undefined;
  return (
    <PlanView
      plan={plan}
      price={plan?.manageHere === true ? (offer?.priceString ?? null) : null}
      boosts={boosts}
      restore={restore}
      storeAvailable={store !== null}
      onBack={() => {
        const settings = hrefFor(SETTINGS);
        if (router.canGoBack()) router.back();
        else if (settings !== undefined) router.replace(settings);
      }}
      onUpgrade={() => router.push({ pathname: MONETIZE_ROUTES.paywall, params: { entry: ENTRY } })}
      onManageStore={manage}
      onRestore={recheck}
      onCancel={() => router.push(MONETIZE_ROUTES.cancel)}
      onBillingIssue={() => router.push(MONETIZE_ROUTES.billingIssue)}
    />
  );
}
