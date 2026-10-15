/**
 * A trip ahead (3.05 "Coming up"): 166 high, r26 card, the guide on a tinted 90 disc at the top
 * corner, the place 19/700 with its dates, and a 5 pt progress bar with its stage word.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  CritterSticker,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { tripDay } from '../../format';
import { guideArt } from '../../guide-art';
import { tripStage, type PremiumTripRow } from './trips-model';

const useStyles = makePremiumStyles((t) => ({
  card: {
    flex: 1,
    // Tall enough that a long name ("Your next trip") sits under the guide's disc, not across it.
    minHeight: 166,
    borderRadius: t.radius.cardLarge,
    backgroundColor: t.color.card,
    boxShadow: t.shadow.card,
    padding: t.space.rowPadH,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    gap: 4,
  },
  disc: {
    position: 'absolute',
    top: -14,
    end: -12,
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: t.color.control,
    overflow: 'hidden',
    marginTop: 6,
  },
}));

export interface TripMiniCardProps {
  readonly trip: PremiumTripRow;
  readonly index: number;
  readonly onPress: () => void;
}

export function TripMiniCard({ trip, index, onPress }: TripMiniCardProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const guide = guideArt(trip.guide_slug);
  const stage = tripStage(trip);
  const place =
    trip.destination_name ?? t({ id: 'home.nextUp.untitled', message: 'Your next trip' });
  const when = trip.start_date === null ? null : tripDay(locale, trip.start_date);
  const percent = stage === 'voting' ? 10 : Math.max(8, Math.min(100, trip.plan_progress ?? 0));
  const fill = index % 2 === 0 ? theme.accent.tangerine : theme.accent.sun;
  // In dark the status tints and a faded accent both turn to muddy browns over the card: the disc
  // is the lifted control grey there, and the critter carries the colour.
  const tint =
    theme.scheme === 'dark'
      ? theme.color.control
      : index % 2 === 0
        ? theme.color.status.tangerine.bg
        : theme.color.status.maybe.bg;
  const word =
    stage === 'voting'
      ? t({ id: 'home.premium.trips.voting', message: 'Voting' })
      : stage === 'locked'
        ? t({ id: 'home.premium.trips.locked', message: `Plan ${percent}%` })
        : t({ id: 'home.premium.trips.planning', message: 'Planning' });
  return (
    <PressableScale
      onPress={onPress}
      style={styles.card}
      accessibilityLabel={[place, when, word].filter((part) => part !== null).join(', ')}
      testID={`trip-list-row-${trip.id}`}
    >
      <View style={[styles.disc, { backgroundColor: tint }]} pointerEvents="none">
        <CritterSticker
          kind={guide.kind}
          name={guide.name}
          seed={guide.seed}
          size={70}
          pose="wave"
        />
      </View>
      <Text variant="navTitle" numberOfLines={1}>
        {place}
      </Text>
      {/* Always a line under the name, so cards side by side share their baselines. */}
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {when ??
          (stage === 'voting'
            ? t({ id: 'home.premium.trips.datesToVote', message: 'Dates to vote' })
            : t({ id: 'home.premium.trips.noDates', message: 'No dates yet' }))}
      </Text>
      <View style={styles.bar}>
        <View style={{ width: `${percent}%`, height: 5, backgroundColor: fill }} />
      </View>
      <Text variant="tier" tone="inkSecondary">
        {word}
      </Text>
    </PressableScale>
  );
}
