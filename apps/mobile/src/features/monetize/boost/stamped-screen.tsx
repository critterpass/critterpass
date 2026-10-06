/** Stamped (4b-5) over the trip's synced boost row. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and Intl option values, never copy. */
import { format } from '@cp/i18n';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { deviceTier, impact } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';

import { TRIP_SQL, TRIP_TABLES, type TripRow } from '../data/billing-rows';
import { StampedView } from './stamped-view';

const BOOST_SQL = `SELECT starts_at, ends_at FROM trip_boosts
  WHERE trip_id = ? AND status IN ('scheduled', 'active') ORDER BY created_at DESC LIMIT 1`;
const BOOST_TABLES = ['trip_boosts'];
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

export function StampedScreen() {
  const params = useLocalSearchParams<{ tripId?: string; split?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const locale = useLocale();
  const [motionMode] = useMotionMode();
  const { width, height } = useWindowDimensions();
  const key = tripId === '' ? null : [tripId];
  const trip = useLiveRows<TripRow>(TRIP_SQL, key, TRIP_TABLES).rows[0];
  const boost = useLiveRows<{ starts_at: string | null; ends_at: string | null }>(
    BOOST_SQL,
    key,
    BOOST_TABLES,
  ).rows[0];
  const boosted = boost !== undefined;

  useEffect(() => {
    if (!boosted) return;
    impact('success');
    if (motionMode === 'full') triggerConfetti(width / 2, height * 0.3, 'medium', deviceTier);
    // Once, when the boost row arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boosted]);

  const until =
    boost?.ends_at == null ? '' : format.date(locale, new Date(boost.ends_at), DAY_MONTH);
  return (
    <StampedView
      boosted={boosted}
      destination={trip?.destination ?? ''}
      crew={trip?.crew ?? ''}
      window={until}
      split={params.split === '1'}
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
