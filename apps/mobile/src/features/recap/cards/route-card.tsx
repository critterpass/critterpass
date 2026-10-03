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
import { RouteRider, type RouteStop } from '@/ui/recap/RouteRider';
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
  trail: { flex: 1 },
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
      <View style={styles.trail}>
        <RouteRider
          stops={stops}
          distance={formatKm(km)}
          reached={Math.max(0, reached - 1)}
          rider={<Sticker kind={art.kind} name={art.name} size={36} pose="hop" />}
        />
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
