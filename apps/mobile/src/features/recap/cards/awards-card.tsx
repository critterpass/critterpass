/**
 * Card 4, the crew awards (3m-5): one card per traveller dealt from the top one after another,
 * each resting at its own small angle (the same on every phone), the guide's title and line (or
 * the award's own number while unwritten), a star on the one you voted for, and a gold edge on the
 * MVP once the crew has picked one. VOTE FOR THE MVP sits in the story's footer.
 */
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSettle } from '@/motion/patterns/settle';
import { Icon } from '@/ui/icons/Icon';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

const DEAL_GAP_MS = 160;
const SHOWN = 6;

export interface AwardCardData {
  readonly id: string;
  readonly userId: string;
  readonly initial: string;
  readonly title: string;
  readonly line: string;
  readonly mvp: boolean;
  readonly mine: boolean;
}

/** A resting angle of 1–3° either way, from the traveller's id: the same on every phone. */
export function restingAngle(userId: string): number {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const size = 1 + (hash % 3);
  return hash % 2 === 0 ? size : -size;
}

const useStyles = makeStyles((th) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: th.space['10'],
  },
  card: {
    width: '48.5%',
    minHeight: th.space['32'] * 4,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['6'],
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  face: {
    width: th.space['32'],
    height: th.space['32'],
    borderRadius: th.space['16'],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.ink['900'],
  },
}));

function Dealt({
  award,
  color,
  dealt,
}: {
  readonly award: AwardCardData;
  readonly color: string;
  readonly dealt: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const settle = useSettle({ active: dealt });
  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: color,
          opacity: dealt ? 1 : 0,
          transform: [{ rotate: `${restingAngle(award.userId)}deg` }],
        },
        award.mvp ? { borderWidth: theme.space['4'], borderColor: theme.color.gold.base } : null,
      ]}
      testID={`recap-award-card-${award.id}`}
    >
      <Animated.View style={settle}>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${award.title}, ${award.line}`}
        >
          <SurfaceToneProvider value="accent">
            <View style={styles.top}>
              <View style={styles.face}>
                <Text variant="label" color={color}>
                  {award.initial}
                </Text>
              </View>
              <Icon
                name="star"
                size={22}
                decorative
                {...(award.mine || award.mvp ? { color: theme.color.ink['900'] } : {})}
              />
            </View>
            <Text variant="h3">{award.title}</Text>
            <Text variant="bodySm">{award.line}</Text>
          </SurfaceToneProvider>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export interface AwardsCardProps {
  readonly eyebrow: string;
  readonly headline: string;
  readonly awards: readonly AwardCardData[];
}

export function AwardsCard({ eyebrow, headline, awards }: AwardsCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const shown = awards.slice(0, SHOWN);
  const dealt = useCardTimeline(shown.map((_, index) => 400 + index * DEAL_GAP_MS));
  const colors = [
    theme.color.yellow,
    theme.color.pink,
    theme.color.green.base,
    theme.color.blue,
    theme.color.orange,
    theme.color.paper.warm,
  ];
  return (
    <CardShell
      ground={theme.semantic.bg.base}
      tone="dark"
      eyebrow={eyebrow}
      eyebrowColor={theme.color.pink}
      headline={headline}
      testID="recap-card-awards"
    >
      <View style={styles.grid}>
        {shown.map((award, index) => (
          <Dealt
            key={award.id}
            award={award}
            color={colors[index % colors.length] ?? theme.color.yellow}
            dealt={dealt > index}
          />
        ))}
      </View>
    </CardShell>
  );
}
