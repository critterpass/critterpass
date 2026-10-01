/**
 * 3b-2's next-up card: "NEXT UP · OCT 12", the destination in the mega face, the live countdown
 * chip and PLAN n%, with the trip's guide bobbing over the corner (2800 ms). The plan pill shows
 * once the trip has progress to report: a plan at 0% says nothing true about a trip just locked.
 * Tapping it grows into the trip hub once that screen is registered. A trip still choosing its place reads "Your next
 * trip" and shows no countdown until it has dates. The destination's photo sits under it as a
 * duotone of the card's colour when one exists.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import Animated from 'react-native-reanimated';

import type { HomeTripInput } from '@cp/domain';

import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';
import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { CountdownCard } from '@/ui/cards/CountdownCard';
import { cardBackground } from '@/ui/cards/tone';
import { InfoPill } from '@/ui/chips/InfoPill';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { Sticker } from '@/ui/sticker/Sticker';
import { useTheme } from '@/ui/theme';
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
  const theme = useTheme();
  const photo = heroAt(useDestinationMedia(trip.destinationSlug ?? null).items);

  return (
    <CountdownCard
      testID={testID}
      tone={guideTone(guide)}
      halftone={photo === null}
      backdrop={
        <MediaLayer
          media={photo}
          surface="accent"
          accent={cardBackground(theme, guideTone(guide))}
          creditAt="top"
          testID={`${testID}-photo`}
        />
      }
      eyebrow={upper(eyebrow, locale)}
      title={upper(place, locale)}
      {...(progress > 0
        ? {
            metaLabel: t({
              id: 'home.nextUp.planSpoken',
              message: `plan ${progress} percent done`,
            }),
          }
        : {})}
      stickerSize={NEXT_UP_STICKER}
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
          {progress > 0 ? (
            <InfoPill variant="outline" testID="home-plan-progress">
              {upper(t({ id: 'home.nextUp.plan', message: `Plan ${progress}%` }), locale)}
            </InfoPill>
          ) : null}
        </>
      }
      {...(hub === undefined ? {} : { onPress: () => void zoomTo(tripCardId(trip.id), hub) })}
    />
  );
}
