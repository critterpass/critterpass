/**
 * The trip as a collage card (3.02): "Next up · Oct 12", the destination at hero size, the live
 * countdown and the plan ring, who is going, two polaroids of the place and the guide hanging over
 * the card's top. A place with no photos yet shows the paper plane sticker instead of empty frames. From the first day on the trip's clock it is today's card ("Today · Day 4 of 8").
 * The card zooms into the trip hub (1.05).
 */
/* eslint-disable lingui/no-unlocalized-strings -- sizes and pose names, never copy. */
import type { HomeTripInput } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  CritterSticker,
  CrewStack,
  Tag,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';
import type { CrewMember } from '@/ui/premium';
import { ZoomLink } from '@/ui/premium/shell';

import { tripDay } from '../../format';
import { guideArt } from '../../guide-art';
import { tripIsLockedIn } from '../../slots';
import { tripDayOf } from '../../trip-day';
import { CountdownPill } from './countdown-pill';
import { PlanRingPill } from './plan-ring-pill';
import { Polaroid } from './polaroid';
import { useHasTripPhoto } from './trip-photo';

const useStyles = makePremiumStyles((t) => ({
  // At least the collage's height; larger type grows the card and the "going" row stays under
  // the words instead of over them.
  card: {
    minHeight: 256,
    borderRadius: 30,
    backgroundColor: t.color.card,
    boxShadow: '0 2px 4px rgba(20,22,40,.05), 0 18px 40px rgba(20,22,40,.09)',
    padding: t.space.gutter,
    paddingTop: 18,
    paddingBottom: 18,
  },
  text: { width: '58%', gap: t.space.gap8, zIndex: 2 },
  hero: { lineHeight: 63 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.gap6 },
  going: {
    marginTop: 'auto',
    paddingTop: t.space.gap8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap8,
  },
  collage: { position: 'absolute', top: 0, end: 0, width: 190, height: 256 },
  photo1: { position: 'absolute', top: 30, end: 16 },
  photo2: { position: 'absolute', top: 96, end: 72 },
  plane: { position: 'absolute', top: 92, end: 40, transform: [{ rotate: '-8deg' }] },
  dayTag: { position: 'absolute', top: 150, end: 20 },
  guide: { position: 'absolute', top: -44, end: 6 },
}));

export interface TripCollageCardProps {
  readonly trip: HomeTripInput;
  /** The crew members holding a seat (never someone who has not joined). */
  readonly going: readonly CrewMember[];
  readonly now: Date;
  readonly testID?: string;
}

export function TripCollageCard({
  trip,
  going,
  now,
  testID = 'home-next-up',
}: TripCollageCardProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const guide = guideArt(trip.guideId);
  const place =
    trip.destinationName ?? t({ id: 'home.nextUp.untitled', message: 'Your next trip' });
  const onTrip = tripDayOf(trip, now);
  const dayNo = onTrip?.day ?? 0;
  const dayCount = onTrip?.days ?? 0;
  const day = trip.startDate === null ? null : tripDay(locale, trip.startDate);
  const eyebrow =
    onTrip !== null
      ? t({ id: 'home.premium.today', message: `Today · Day ${dayNo} of ${dayCount}` })
      : day === null
        ? t({ id: 'home.premium.nextUp', message: 'Next up' })
        : t({ id: 'home.premium.nextUpOn', message: `Next up · ${day}` });
  const target =
    onTrip !== null || trip.countdownTargetAt === null || !tripIsLockedIn(trip.status)
      ? null
      : new Date(trip.countdownTargetAt);
  const progress = onTrip === null ? trip.planProgress : 0;
  const count = going.length;
  const slug = trip.destinationSlug ?? null;
  const hasPhoto = useHasTripPhoto(slug);

  return (
    <ZoomLink
      href={`/hub/${trip.id}`}
      zoomId={`trip-${trip.id}`}
      accessibilityLabel={[eyebrow, place].join(', ')}
      testID={trip.status === 'in_trip' ? 'home-in-trip' : testID}
    >
      <View style={styles.card}>
        <View style={styles.collage} pointerEvents="none">
          {hasPhoto ? (
            <>
              <View style={styles.photo1}>
                <Polaroid slug={slug} width={124} height={150} rotate={8} />
              </View>
              <View style={styles.photo2}>
                <Polaroid slug={slug} index={1} width={116} height={134} rotate={-7} />
              </View>
            </>
          ) : (
            <View style={styles.plane} testID="home-next-up-no-photo">
              <CritterSticker kind="plane" name="plane" size={96} />
            </View>
          )}
          {onTrip === null ? null : (
            <View style={styles.dayTag}>
              <Tag
                label={t({ id: 'home.premium.dayTag', message: `Day ${dayNo}` })}
                color={theme.accent.tangerine}
                rotate={8}
              />
            </View>
          )}
          <View style={styles.guide}>
            <CritterSticker
              kind={guide.kind}
              name={guide.name}
              seed={guide.seed}
              size={92}
              pose={onTrip === null ? 'wave' : 'cheer'}
            />
          </View>
        </View>
        <View style={styles.text}>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text
            variant="hero"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={styles.hero}
          >
            {place}
          </Text>
          <View style={styles.pills}>
            {target === null ? null : (
              <CountdownPill
                target={target}
                trip={{ startDate: trip.startDate, tz: trip.tz }}
                place={place}
              />
            )}
            {progress > 0 ? <PlanRingPill percent={progress} testID="home-plan-progress" /> : null}
          </View>
        </View>
        {count === 0 ? null : (
          <View style={styles.going}>
            <CrewStack
              members={going}
              size={26}
              max={5}
              accessibilityLabel={t({ id: 'home.premium.goingSpoken', message: `${count} going` })}
            />
            <Text variant="label" tone="muted">
              {t({ id: 'home.premium.going', message: `${count} going` })}
            </Text>
          </View>
        )}
      </View>
    </ZoomLink>
  );
}
