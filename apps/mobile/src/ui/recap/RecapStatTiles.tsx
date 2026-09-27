import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { SLAP_STAGGER_MS, useSlap } from '@/motion/patterns/slap';

import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Halftone } from '../textures/halftone';
import { makeStyles } from '../theme';

export interface RecapStat {
  readonly id: string;
  /** Headline number with unit ("214 km"). */
  readonly value: string;
  /** "driven, mostly by Made". */
  readonly caption: string;
  readonly color: string;
}

export interface RecapStatTilesProps {
  readonly stats: readonly RecapStat[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: th.space['10'],
  },
  tile: {
    width: '48%',
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    overflow: 'hidden',
    gap: th.space['4'],
  },
}));

function StatTile({ stat, index }: { readonly stat: RecapStat; readonly index: number }) {
  const styles = useStyles();
  const slap = useSlap({
    active: true,
    direction: index % 2 === 0 ? -1 : 1,
    delayMs: index * SLAP_STAGGER_MS,
  });
  return (
    <Animated.View style={[styles.tile, { backgroundColor: stat.color }, slap]}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${stat.value}, ${stat.caption}`}
      >
        <SurfaceToneProvider value="accent">
          <Halftone />
          <Text variant="h2">{stat.value}</Text>
          <Text variant="bodySm">{stat.caption}</Text>
        </SurfaceToneProvider>
      </View>
    </Animated.View>
  );
}

/** Tilted colour tiles with the trip's headline numbers, slapping in one by one. */
export function RecapStatTiles({ stats, testID }: RecapStatTilesProps) {
  const styles = useStyles();
  return (
    <View style={styles.grid} testID={testID}>
      {stats.map((stat, index) => (
        <StatTile key={stat.id} stat={stat} index={index} />
      ))}
    </View>
  );
}
