/**
 * The plan chip other screens show ("PASS+ · YEARLY ›"): the plan from the synced rows, opening
 * Your plan. The server's Pass+ flag alone decides whether it reads as Pass+.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { storePlatform } from '@/data/billing';

import { useBillingRows } from '../data/use-billing-rows';
import { MONETIZE_ROUTES } from '../routes';
import { planModel } from './plan-model';

export function usePlanChip(): { readonly label: string; readonly onPress: () => void } | null {
  const { t } = useLingui();
  const rows = useBillingRows();
  if (!rows.loaded) return null;
  const plan = planModel({
    subscriptions: rows.subscriptions,
    passPlus: rows.passPlus,
    passPlusUntil: rows.passPlusUntil,
    deviceStore: storePlatform(),
  });
  let label: string;
  if (!plan.passPlus) {
    label = t({ id: 'monetize.chip.free', message: 'Free plan ›' });
  } else if (plan.period === 'yearly') {
    label = t({ id: 'monetize.chip.yearly', message: 'Pass+ · Yearly ›' });
  } else if (plan.period === 'monthly') {
    label = t({ id: 'monetize.chip.monthly', message: 'Pass+ · Monthly ›' });
  } else {
    label = t({ id: 'monetize.chip.passPlus', message: 'Pass+ ›' });
  }
  return { label, onPress: () => router.push(MONETIZE_ROUTES.plan) };
}
