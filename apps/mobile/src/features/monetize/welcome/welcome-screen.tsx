/**
 * The welcome (4e-3) over the synced rows: it celebrates only once the server's Pass+ flag is on,
 * and says when Pass+ renews or ends from the subscription row.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import { format } from '@cp/i18n';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { storePlatform } from '@/data/billing';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { deviceTier, impact } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';

import { useBillingRows } from '../data/use-billing-rows';
import { perkLines } from '../perks/perk-copy';
import { usePlanLine } from '../plan/plan-copy';
import { planModel } from '../plan/plan-model';
import { WelcomeView } from './welcome-view';

const STAMP_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const ICON_PICKER = '3n-5';

export function WelcomeScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  // Pass+ that came back (a restore, a code) is welcomed without the party.
  const celebrate = params.from !== 'restore';
  const locale = useLocale();
  const rows = useBillingRows();
  const planLine = usePlanLine();
  const [motionMode] = useMotionMode();
  const { width, height } = useWindowDimensions();
  const [openedOn] = useState(() => new Date());

  const { passPlus } = rows;
  useEffect(() => {
    if (!passPlus || !celebrate) return;
    impact('success');
    if (motionMode === 'full') triggerConfetti(width / 2, height * 0.35, 'large', deviceTier);
    // Once, when Pass+ turns on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passPlus, celebrate]);

  const perks = useMemo(() => perkLines(rows.perks, 'pass_plus'), [rows.perks]);
  const plan = planModel({
    subscriptions: rows.subscriptions,
    passPlus,
    passPlusUntil: rows.passPlusUntil,
    deviceStore: storePlatform(),
  });
  const icons = hrefFor(ICON_PICKER);

  return (
    <WelcomeView
      name={rows.name}
      passPlus={passPlus}
      celebrate={celebrate}
      admittedOn={format.date(locale, openedOn, STAMP_DATE)}
      perks={perks}
      renewal={passPlus ? planLine(plan) : null}
      onPickIcon={icons === undefined ? undefined : () => router.replace(icons)}
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
