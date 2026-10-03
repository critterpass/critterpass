/**
 * Card 3, the route (3m-4): the kilometres roll up while the guide rides the trail stop by stop,
 * each stop popping as it is reached and an early start glowing orange with its time, over the
 * longest leg in the guide's hand. Nine seconds: the one long card.
 */
import { View } from 'react-native';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { CountUp } from '@/ui/data/CountUp';
import { Icon } from '@/ui/icons/Icon';
import type { GuideId } from '@/ui/people/GuideLine';
import type { RouteStop } from '@/ui/recap/RouteRider';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

/** The story token for this card: it is the long one. */
export const ROUTE_CARD_MS = 9000;
const FIRST_STOP_MS = 900;
const LAST_STOP_MS = 7200;

const useStyles = makeStyles((th) => ({
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  // The trail fills the card: stops spread down it, never further apart than a comfortable step.
  trail: { flex: 1, justifyContent: 'space-evenly', maxHeight: th.space['32'] * 18 },
  line: {
    position: 'absolute',
    start: th.space['16'] - 1,
    top: th.space['24'],
    bottom: th.space['24'],
    borderStartWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.action.primary,
  },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    minHeight: th.space['32'] + th.space['12'],
  },
  dot: {
    width: th.space['20'],
    height: th.space['20'],
    marginHorizontal: th.space['6'],
    borderRadius: th.space['10'],
    borderWidth: th.space['4'],
  },
}));

/** When each of `count` stops pops, spread over the card. */
export function stopTimes(count: number): number[] {
  if (count <= 1) return count === 1 ? [FIRST_STOP_MS] : [];
  const gap = (LAST_STOP_MS - FIRST_STOP_MS) / (count - 1);
  return Array.from({ length: count }, (_, index) => Math.round(FIRST_STOP_MS + index * gap));
}

export interface RouteCardProps {
  readonly guide: GuideId;
  readonly eyebrow: string;
  readonly km: number;
  readonly formatKm: (value: number) => string;
  readonly line: string;
  readonly stops: readonly RouteStop[];
  readonly longestLeg: string | null;
}

export function RouteCard({
  guide,
  eyebrow,
  km,
  formatKm,
  line,
  stops,
  longestLeg,
}: RouteCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const art = GUIDE_STICKERS[guide];
  const reached = useCardTimeline([300, ...stopTimes(stops.length)]);
  const rolling = reached > 0;
  return (
    <CardShell
      ground={theme.semantic.bg.base}
      tone="dark"
      eyebrow={eyebrow}
      testID="recap-card-route"
    >
      <CountUp
        value={rolling ? km : 0}
        formatValue={formatKm}
        variant="displayHero"
        accessibilityLabel={formatKm(km)}
        testID="recap-route-km"
      />
      <SecondaryText variant="body">{line}</SecondaryText>
      <View
        style={styles.trail}
        accessible
        accessibilityLabel={stops.map((stop) => `${stop.name} ${stop.dayLabel}`).join(', ')}
      >
        <View style={styles.line} />
        {stops.map((stop, index) => {
          const done = index < reached - 1;
          const color =
            stop.highlight === true ? theme.semantic.state.warning : theme.semantic.action.primary;
          const here = index === Math.max(0, reached - 2);
          return (
            <View key={stop.id} style={styles.stop} testID={`recap-route-stop-${index}`}>
              {here && reached > 1 ? (
                <Sticker kind={art.kind} name={art.name} size={36} pose="hop" />
              ) : (
                <View
                  style={[
                    styles.dot,
                    { borderColor: color, backgroundColor: done ? color : theme.semantic.bg.base },
                  ]}
                />
              )}
              <Text variant="title" style={{ flex: 1 }}>
                {stop.name}
              </Text>
              <Text
                variant="monoData"
                color={stop.highlight === true ? color : theme.semantic.text.secondary}
              >
                {stop.dayLabel}
              </Text>
            </View>
          );
        })}
      </View>
      {longestLeg === null ? null : (
        <View style={styles.leg}>
          <Icon name="car" size={24} decorative />
          <Text variant="voice" color={theme.color.yellow} style={{ flex: 1 }}>
            {longestLeg}
          </Text>
        </View>
      )}
    </CardShell>
  );
}
