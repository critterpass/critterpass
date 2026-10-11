/**
 * Two story cards. New friends: the forms found on the trip as stickers, cheering in a loose grid.
 * The route (8.10): the distance huge with the guide's line in its hand, the stops down a dashed
 * trail landing one by one with the card's clock (the dawn start glowing tangerine), the car
 * floating beside them, and the longest leg on a card.
 */
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Float } from '@/features/critters';
import { useStoryClock } from '@/ui/story/story-clock';
import {
  CritterSticker,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { CrittersCardProps } from '../../../cards/critters-card';
import { stopTimes, type RouteCardProps } from '../../../cards/route-card';
import { CardFrame, FormSticker } from './card-frame';
import { useClockReached } from './use-clock';

const useStyles = makePremiumStyles((th) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginTop: 24,
  },
  trail: { flex: 1, justifyContent: 'space-evenly', marginTop: 12 },
  line: {
    position: 'absolute',
    left: 9,
    top: 18,
    bottom: 18,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    borderColor: th.color.outlineEmpty,
  },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 4, backgroundColor: th.color.card },
  leg: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

export function PremiumCrittersCard({ eyebrow, headline, line, forms }: CrittersCardProps) {
  const styles = useStyles();
  return (
    <CardFrame testID="recap-card-critters">
      <Text variant="label" tone="muted">
        {eyebrow}
      </Text>
      <Text variant="display">{headline}</Text>
      <Text variant="body" tone="muted">
        {line}
      </Text>
      <View style={styles.grid}>
        {forms.slice(0, 9).map((row, index) => (
          <View key={row.id} style={{ transform: [{ rotate: `${(index % 3) * 4 - 4}deg` }] }}>
            <FormSticker row={row} size={88} pose="cheer" />
          </View>
        ))}
      </View>
    </CardFrame>
  );
}

function Stop({
  stop,
  at,
}: {
  readonly stop: RouteCardProps['stops'][number];
  readonly at: number;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const shown = useClockReached(at);
  if (!shown) return <View style={{ height: 44 }} />;
  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(150) : FadeInDown.springify().damping(16)}
      style={styles.stop}
    >
      <View
        style={[
          styles.dot,
          { borderColor: stop.highlight === true ? th.accent.tangerine : th.color.ink },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{stop.name}</Text>
        <Text
          variant="captionMuted"
          color={stop.highlight === true ? th.color.status.tangerine.text : th.color.muted}
        >
          {stop.dayLabel}
        </Text>
      </View>
    </Animated.View>
  );
}

export function PremiumRouteCard(props: RouteCardProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const clock = useStoryClock();
  const times = stopTimes(props.stops.length);
  return (
    <CardFrame testID="recap-card-route">
      <Text variant="label" tone="muted">
        {props.eyebrow}
      </Text>
      <Text variant="hero" accessibilityLiveRegion={clock.paused ? 'none' : 'polite'}>
        {props.formatKm(props.km)}
      </Text>
      <Text variant="guide" color={th.color.status.maybe.text}>
        {props.line}
      </Text>
      <View style={styles.trail}>
        <View style={styles.line} />
        {props.stops.map((stop, index) => (
          <Stop key={stop.id} stop={stop} at={times[index] ?? 0} />
        ))}
        <View style={{ position: 'absolute', right: 0, top: '30%' }} pointerEvents="none">
          <Float ms={4200}>
            <CritterSticker kind="car" name={props.eyebrow} size={78} />
          </Float>
        </View>
      </View>
      {props.longestLeg === null ? null : (
        <View style={styles.leg}>
          <Text variant="rowText">{props.longestLeg}</Text>
        </View>
      )}
    </CardFrame>
  );
}
