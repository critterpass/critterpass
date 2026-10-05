/**
 * 3b-2's next-up card: "NEXT UP · OCT 12", the destination in the mega face, the live countdown
 * chip and PLAN n%, with the trip's guide bobbing over the corner (2800 ms). The plan pill shows
 * once the trip has progress to report: a plan at 0% says nothing true about a trip just locked.
 * Tapping it grows into the trip hub once that screen is registered. A trip still choosing its place reads "Your next
 * trip". The countdown starts when the trip is locked in: until then the card says whose turn it
 * is, with the one button for the viewer's next step, in a strip under it (./trip-turn-row.tsx). The title is
 * one line under the sticker, shrunk to fit, so a name never breaks inside a word. From the first
 * day's midnight on the trip's clock the card is today's ("TODAY · DAY 1 OF 3"), with the next stop
 * and one button into the day under it (./today-strip.tsx), whether or not the trip's status has
 * switched yet. The
 * destination's photo sits under it as a duotone of the card's colour when one exists.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { HomeTripInput } from '@cp/domain';

import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { cardBackground } from '@/ui/cards/tone';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { zoomTo } from '@/ui/transitions/use-shared-source';

import { CountdownChip } from './countdown-chip';
import { guideOr, guideTone, tripDay } from './format';
import { homeRoutes } from './routes';
import { tripIsLockedIn } from './slots';
import { TodayStrip } from './today-strip';
import { tripDayOf } from './trip-day';
import { TripTurnRow } from './trip-turn-row';

export const NEXT_UP_STICKER = 124;
/** The sticker beside a title that shares the card with a state line and a button. */
const CARD_STICKER = 96;
/** A long destination name shrinks to this before it would be cut. */
const TITLE_MIN_SIZE = 32;

const useStyles = makeStyles((t) => ({
  sticker: { position: 'absolute', top: t.space['8'], end: t.space['8'] },
  // The title starts below the sticker, so it has the card's whole width.
  title: { marginTop: CARD_STICKER - t.space['32'] },
}));

/** The shared-element id the card grows from into the trip hub. */
export function tripCardId(tripId: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a shared-element id, never copy.
  return `trip-card-${tripId}`;
}

const systemNow = (): Date => new Date();

export interface NextUpCardProps {
  readonly trip: HomeTripInput;
  /** The countdown's clock (tests pin it). */
  readonly now?: () => Date;
  readonly testID?: string;
}

export function NextUpCard({ trip, now, testID = 'home-next-up' }: NextUpCardProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const bob = useLoop('bob');
  const guide = guideOr(trip.guideId);
  const sticker = guideSticker(guide);
  const place =
    trip.destinationName ?? t({ id: 'home.nextUp.untitled', message: 'Your next trip' });
  const day = trip.startDate === null ? null : tripDay(locale, trip.startDate);
  // From the first day's midnight on the trip's clock the card is today's, whatever the status.
  const at = (now ?? systemNow)();
  // The day's plan is read from the session's database; a bare render (no session) draws none.
  const localFirst = useContext(LocalFirstContext);
  const onTrip = tripDayOf(trip, at);
  const dayNo = onTrip?.day ?? 0;
  const dayCount = onTrip?.days ?? 0;
  const eyebrow = upper(
    onTrip !== null
      ? t({ id: 'home.inTrip.eyebrowOf', message: `Today · Day ${dayNo} of ${dayCount}` })
      : day === null
        ? t({ id: 'home.nextUp.eyebrowUndated', message: 'Next up' })
        : t({ id: 'home.nextUp.eyebrow', message: `Next up · ${day}` }),
    locale,
  );
  // A countdown to the second says the trip is settled: it starts at the lock, and stops on the
  // first day.
  const target =
    onTrip !== null || trip.countdownTargetAt === null || !tripIsLockedIn(trip.status)
      ? null
      : new Date(trip.countdownTargetAt);
  const progress = onTrip === null ? trip.planProgress : 0;
  const hub = homeRoutes.tripHub(trip.id);
  const theme = useTheme();
  const photo = heroAt(useDestinationMedia(trip.destinationSlug ?? null).items);
  const title = upper(place, locale);
  const spoken =
    progress > 0
      ? t({ id: 'home.nextUp.planSpoken', message: `plan ${progress} percent done` })
      : null;

  const card = (
    <Card
      // `home-in-trip` stays the sign that the trip's status has switched (flows wait on it).
      testID={trip.status === 'in_trip' ? 'home-in-trip' : testID}
      tone={guideTone(guide)}
      halftone={photo === null}
      radius="cardBig"
      backdrop={
        <MediaLayer
          media={photo}
          surface="accent"
          accent={cardBackground(theme, guideTone(guide))}
          creditAt="top"
          testID={`${testID}-photo`}
        />
      }
      accessibilityLabel={[eyebrow, title, spoken].filter(Boolean).join(', ')}
      {...(hub === undefined
        ? {}
        : {
            onPress: () =>
              onTrip === null ? void zoomTo(tripCardId(trip.id), hub) : router.push(hub),
          })}
    >
      <View style={styles.sticker} pointerEvents="none">
        <Animated.View style={bob}>
          <Sticker
            kind={sticker.kind}
            name={sticker.name}
            size={CARD_STICKER}
            pose={onTrip === null ? 'wave' : 'cheer'}
          />
        </Animated.View>
      </View>
      <Stack gap="8">
        {/* On the first day, before the status switches, the eyebrow is the card's "when": it
            keeps the countdown's id, which read TODAY here. */}
        <Text
          variant="eyebrow"
          {...(onTrip !== null && trip.status !== 'in_trip' ? { testID: 'home-countdown' } : {})}
        >
          {eyebrow}
        </Text>
        {/* One line across the card's full width, under the sticker: the words stay whole and the
            name shrinks to fit rather than breaking inside a word. */}
        <Text
          variant="displayMega"
          autoFit
          autoFitMinSize={TITLE_MIN_SIZE}
          numberOfLines={1}
          style={styles.title}
        >
          {title.replaceAll(' ', '\u00a0')}
        </Text>
        {target === null && progress <= 0 ? null : (
          <Row gap="8" wrap>
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
          </Row>
        )}
      </Stack>
    </Card>
  );
  // The state line and its button sit under the card, as their own element: a button inside the
  // card's one pressable would be out of a screen reader's reach.
  return (
    <Stack gap="8">
      {card}
      {onTrip === null || localFirst === null ? null : (
        <TodayStrip
          tripId={trip.id}
          tz={trip.tz}
          today={onTrip.today}
          minuteIso={new Date(Math.floor(at.getTime() / 60_000) * 60_000).toISOString()}
        />
      )}
      <TripTurnRow tripId={trip.id} guide={sticker.name} onlyMine={onTrip !== null} />
    </Stack>
  );
}
