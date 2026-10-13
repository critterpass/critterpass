/**
 * The welcome's state over the synced rows, for both UIs: it celebrates only once the server's
 * Pass+ flag is on, and says when Pass+ renews or ends from the subscription row.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import { format } from '@cp/i18n';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { storePlatform } from '@/data/billing';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { closePurchaseModals } from '../close-modals';
import { useBillingRows } from '../data/use-billing-rows';
import { perkLines } from '../perks/perk-copy';
import { usePlanLine } from '../plan/plan-copy';
import { planModel } from '../plan/plan-model';
import type { WelcomeViewProps } from './welcome-props';

const STAMP_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const ICON_PICKER = '3n-5';

export function useWelcomeScreen(): WelcomeViewProps {
  const params = useLocalSearchParams<{ from?: string }>();
  // Pass+ that came back (a restore, a code) is welcomed without the party.
  const celebrate = params.from !== 'restore';
  const locale = useLocale();
  const rows = useBillingRows();
  const planLine = usePlanLine();
  const [openedOn] = useState(() => new Date());

  const { passPlus } = rows;
  const perks = useMemo(() => perkLines(rows.perks, 'pass_plus'), [rows.perks]);
  const plan = planModel({
    subscriptions: rows.subscriptions,
    passPlus,
    passPlusUntil: rows.passPlusUntil,
    deviceStore: storePlatform(),
  });
  const icons = hrefFor(ICON_PICKER);

  return {
    name: rows.name,
    passPlus,
    celebrate,
    admittedOn: format.date(locale, openedOn, STAMP_DATE),
    perks,
    renewal: passPlus ? planLine(plan) : null,
    onPickIcon: icons === undefined ? undefined : () => router.replace(icons),
    onDone: closePurchaseModals,
  };
}
