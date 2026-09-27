import { t } from '@lingui/core/macro';
import { Canvas, Path } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useSlap } from '@/motion/patterns/slap';

import { makeStyles, useTheme } from '../theme';

export type EggState = 'resting' | 'wobbling' | 'cracking' | 'hatched';

export interface EggProps {
  readonly state: EggState;
  /** Shell colour (the destination colour). @default action.primary */
  readonly color?: string;
  /** Egg width in points; height follows. @default 72 */
  readonly size?: number;
  /** The hatched critter's sticker. */
  readonly hatchling?: ReactNode;
  readonly hatchlingName?: string;
  readonly testID?: string;
}

const WOBBLE_DEG = 6;
const HEIGHT_RATIO = 1.25;

const useStyles = makeStyles((th) => ({
  spot: {
    position: 'absolute',
    borderRadius: th.radius.xl,
    backgroundColor: th.color.paper.bright,
    opacity: 0.55,
  },
}));

function crackPath(width: number, height: number): string {
  const y = height * 0.48;
  const step = width / 6;
  const points = Array.from(
    { length: 7 },
    (_, i) => [i * step, y + (i % 2 === 0 ? -6 : 6)] as const,
  );
  return points.map(([x, py], i) => [i === 0 ? 'M' : 'L', x, py].join(' ')).join(' ');
}

function Hatchling({ children }: { readonly children: ReactNode }) {
  const slap = useSlap({ active: true });
  return <Animated.View style={slap}>{children}</Animated.View>;
}

/** The trip egg: rests, wobbles, cracks, then hatches into the guide sticker. */
export function Egg({ state, color, size = 72, hatchling, hatchlingName, testID }: EggProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const rotate = useSharedValue(0);
  const height = size * HEIGHT_RATIO;

  useEffect(() => {
    if (reduced || state === 'resting' || state === 'hatched') {
      rotate.value = 0;
      return;
    }
    const beat = tokens.motion.duration.fast;
    rotate.value =
      state === 'wobbling'
        ? withRepeat(
            withSequence(
              withTiming(WOBBLE_DEG, { duration: beat }),
              withTiming(-WOBBLE_DEG, { duration: beat }),
              withTiming(0, { duration: beat }),
            ),
            -1,
          )
        : withSequence(
            withTiming(WOBBLE_DEG * 2, { duration: beat / 2 }),
            withTiming(-WOBBLE_DEG * 2, { duration: beat / 2 }),
            withTiming(0, { duration: beat / 2 }),
          );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rotate is a stable shared value ref.
  }, [state, reduced]);
  const wobble = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));

  const label =
    state === 'hatched'
      ? t({ id: 'common.critter.eggHatched', message: `Hatched: ${hatchlingName ?? ''}` })
      : state === 'cracking'
        ? t({ id: 'common.critter.eggCracking', message: 'Critter egg, cracking' })
        : state === 'wobbling'
          ? t({ id: 'common.critter.eggWobbling', message: 'Critter egg, about to hatch' })
          : t({ id: 'common.critter.egg', message: 'Critter egg' });

  if (state === 'hatched' && hatchling) {
    return (
      <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label}>
        <Hatchling>{hatchling}</Hatchling>
      </View>
    );
  }

  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View
        style={[
          {
            width: size,
            height,
            borderTopStartRadius: size / 2,
            borderTopEndRadius: size / 2,
            borderBottomStartRadius: size / 2.2,
            borderBottomEndRadius: size / 2.2,
            backgroundColor: color ?? theme.semantic.action.primary,
            borderWidth: theme.space['2'],
            borderColor: theme.color.paper.ink,
            transformOrigin: 'bottom',
            overflow: 'hidden',
          },
          wobble,
        ]}
      >
        <View
          style={[
            styles.spot,
            { width: size * 0.22, height: size * 0.22, top: height * 0.2, start: size * 0.2 },
          ]}
        />
        <View
          style={[
            styles.spot,
            { width: size * 0.14, height: size * 0.14, top: height * 0.6, end: size * 0.18 },
          ]}
        />
        {state === 'cracking' ? (
          <Canvas style={{ position: 'absolute', width: size, height }}>
            <Path
              path={crackPath(size, height)}
              style="stroke"
              strokeWidth={theme.space['2']}
              color={theme.color.paper.ink}
            />
          </Canvas>
        ) : null}
      </Animated.View>
    </View>
  );
}
