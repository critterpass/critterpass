/** Stamped (4b-5) over the trip's synced boost row. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, a command name and Intl option values, never copy. */
import { format } from '@cp/i18n';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { deviceTier, impact } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';
import { memberFirstName } from '@/ui/people/member-name';

import { shareText } from '../boost-card/boost-card-model';
import {
  CARD_SHARES_SQL,
  CARD_SHARES_TABLES,
  type CardShareRow,
} from '../boost-card/boost-card-rows';
import { TRIP_SQL, TRIP_TABLES, type TripRow } from '../data/billing-rows';
import { useOwnerUid } from '../data/use-billing';
import { StampedView } from './stamped-view';

const BOOST_SQL = `SELECT id, buyer_id, split_mode, starts_at, ends_at FROM trip_boosts
  WHERE trip_id = ? AND status IN ('scheduled', 'active') ORDER BY created_at DESC LIMIT 1`;
const BOOST_TABLES = ['trip_boosts'];
const TOLD_SQL = `SELECT id FROM messages WHERE type = 'boost_card' AND ref_id = ? LIMIT 1`;
const TOLD_TABLES = ['messages'];

interface StampedBoostRow {
  readonly id: string;
  readonly buyer_id: string | null;
  readonly split_mode: string | null;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
}

export const tellCrewBoostCommand = defineClientCommand<{ readonly boost_id: string }>({
  name: 'tell_crew_boost',
  offline: true,
});
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

export function StampedScreen() {
  const params = useLocalSearchParams<{ tripId?: string; split?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const locale = useLocale();
  const [motionMode] = useMotionMode();
  const { width, height } = useWindowDimensions();
  const key = tripId === '' ? null : [tripId];
  const trip = useLiveRows<TripRow>(TRIP_SQL, key, TRIP_TABLES).rows[0];
  const boost = useLiveRows<StampedBoostRow>(BOOST_SQL, key, BOOST_TABLES).rows[0];
  const boosted = boost !== undefined;
  const uid = useOwnerUid();
  const boostKey = useMemo(() => (boost === undefined ? null : [boost.id]), [boost]);
  const shares = useLiveRows<CardShareRow>(CARD_SHARES_SQL, boostKey, CARD_SHARES_TABLES).rows;
  const told = useLiveRows<{ id: string }>(TOLD_SQL, boostKey, TOLD_TABLES).rows.length > 0;
  const { send, pending } = useCommand(tellCrewBoostCommand);
  const [asked, setAsked] = useState(false);
  // The split as the server wrote it; the route's flag only stands in until the boost row is here.
  const split = boost === undefined ? params.split === '1' : boost.split_mode === 'split';
  const owing = shares.filter((share) => share.user_id !== boost?.buyer_id);
  const first = owing[0];
  const mine = boost !== undefined && uid !== null && boost.buyer_id === uid;

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
      split={split}
      owing={owing.map((share) => ({
        uid: share.user_id,
        name: memberFirstName(share.display_name),
      }))}
      eachShare={
        first === undefined
          ? null
          : shareText(
              { minor: Number(first.computed_minor ?? 0), currency: first.currency },
              locale,
            )
      }
      {...(mine && trip?.is_solo !== 1
        ? {
            onTell: () => {
              setAsked(true);
              void send({ boost_id: boost.id }).catch(() => setAsked(false));
            },
          }
        : {})}
      told={told || asked}
      telling={pending}
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
