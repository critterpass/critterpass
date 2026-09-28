/**
 * 3b-2's next-up card: "NEXT UP · OCT 12", the destination in the mega face, the live countdown
 * chip and PLAN n%, with the trip's guide bobbing over the corner (2800 ms). Tapping it grows into
 * the trip hub once that screen is registered. A trip still choosing its place reads "Your next
 * trip" and shows no countdown until it has dates.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import Animated from 'react-native-reanimated';

import type { HomeTripInput } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { CountdownCard } from '@/ui/cards/CountdownCard';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Sticker } from '@/ui/sticker/Sticker';
import { zoomTo } from '@/ui/transitions/use-shared-source';

import { CountdownChip } from './countdown-chip';
import { guideOr, guideTone, tripDay } from './format';
import { homeRoutes } from './routes';

export const NEXT_UP_STICKER = 124;

/** The shared-element id the card grows from into the trip hub. */
export function tripCardId(tripId: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a shared-element id, never copy.
  return `trip-card-${tripId}`;
}

export interface NextUpCardProps {
  readonly trip: HomeTripInput;
  /** The countdown's clock (tests pin it). */
  readonly now?: () => Date;
  readonly testID?: string;
}

export function NextUpCard({ trip, now, testID = 'home-next-up' }: NextUpCardProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const bob = useLoop('bob');
  const guide = guideOr(trip.guideId);
  const sticker = GUIDE_STICKERS[guide];
  const place =
    trip.destinationName ?? t({ id: 'home.nextUp.untitled', message: 'Your next trip' });
  const day = trip.startDate === null ? null : tripDay(locale, trip.startDate);
  const eyebrow =
    day === null
      ? t({ id: 'home.nextUp.eyebrowUndated', message: 'Next up' })
      : t({ id: 'home.nextUp.eyebrow', message: `Next up · ${day}` });
  const target = trip.countdownTargetAt === null ? null : new Date(trip.countdownTargetAt);
  const progress = trip.planProgress;
  const hub = homeRoutes.tripHub(trip.id);

  return (
    <CountdownCard
      testID={testID}
      tone={guideTone(guide)}
      eyebrow={upper(eyebrow, locale)}
      title={upper(place, locale)}
      metaLabel={t({ id: 'home.nextUp.planSpoken', message: `plan ${progress} percent done` })}
      sticker={
        <Animated.View style={bob}>
          <Sticker kind={sticker.kind} name={sticker.name} size={NEXT_UP_STICKER} pose="wave" />
        </Animated.View>
      }
      meta={
        <>
          {target === null ? null : (
            <CountdownChip
              target={target}
              trip={{ startDate: trip.startDate, tz: trip.tz }}
              place={place}
              {...(now === undefined ? {} : { now })}
            />
          )}
          <InfoPill variant="outline" testID="home-plan-progress">
            {upper(t({ id: 'home.nextUp.plan', message: `Plan ${progress}%` }), locale)}
          </InfoPill>
        </>
      }
      {...(hub === undefined ? {} : { onPress: () => void zoomTo(tripCardId(trip.id), hub) })}
    />
  );
}
