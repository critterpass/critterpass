/**
 * The recap page's four tilted stat tiles (3m-1): each stamps in after the one before it (scale
 * 1.4 → 1 with a soft thud, a card stagger apart) and rests at its own small angle, the same on
 * every phone. Reduce Motion fades them in at rest.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing } from '@/motion/easing';
import { triggerImpact, useReducedImpactMotion } from '@/motion/patterns/shared';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles, useTheme } from '@/ui/theme';

import type { TileCopy } from './summary-copy';

const slamEasing = bezierEasing(tokens.motion.easing.slam);
const STAMP_MS = tokens.motion.duration.fast;
const STAGGER_MS = tokens.motion.duration.stagger.cards;
/** Resting angles by slot, as the design sets them. */
const ANGLES = [-1.5, 2, 1.5, -2] as const;

const useStyles = makeStyles((th) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: th.space['12'],
  },
  tile: {
    width: '48%',
    minHeight: th.space['32'] * 3,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    overflow: 'hidden',
    gap: th.space['4'],
    justifyContent: 'flex-end',
  },
}));

function StatTile({
  copy,
  index,
  color,
  testID,
}: {
  readonly copy: TileCopy;
  readonly index: number;
  readonly color: string;
  readonly testID: string;
}) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(reduced ? 1 : 1.4);
  const opacity = useSharedValue(0);
  const angle = ANGLES[index % ANGLES.length] ?? 0;

  useEffect(() => {
    const delay = index * STAGGER_MS;
    if (reduced) {
      scale.value = 1;
      opacity.value = withDelay(delay, withTiming(1, { duration: STAMP_MS }));
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: tokens.motion.duration.instant }));
    scale.value = withDelay(
      delay,
      withTiming(1, { duration: STAMP_MS, easing: slamEasing }, (finished) => {
        'worklet';
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id, never copy.
        if (finished) triggerImpact('thud.soft');
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [index, reduced]);

  const stamp = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${angle}deg` }],
  }));

  return (
    <Animated.View style={[styles.tile, { backgroundColor: color }, stamp]} testID={testID}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${copy.value}, ${copy.caption}`}
      >
        <SurfaceToneProvider value="accent">
          <Halftone />
          <Text variant="h2">{copy.value}</Text>
          <Text variant="bodySm">{copy.caption}</Text>
        </SurfaceToneProvider>
      </View>
    </Animated.View>
  );
}

export function StatTiles({
  tiles,
}: {
  readonly tiles: readonly { readonly id: string; readonly copy: TileCopy }[];
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = [theme.color.yellow, theme.color.pink, theme.color.blue, theme.color.green.base];
  return (
    <View style={styles.grid} testID="recap-tiles">
      {tiles.map((tile, index) => (
        <StatTile
          key={tile.id}
          copy={tile.copy}
          index={index}
          color={colors[index % colors.length] ?? theme.color.yellow}
          testID={`recap-tile-${tile.id}`}
        />
      ))}
    </View>
  );
}
