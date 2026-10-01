import { t } from '@lingui/core/macro';
import { Canvas, Group, Path } from '@shopify/react-native-skia';
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

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useSlap } from '@/motion/patterns/slap';

import { eggDoodle } from '../icons/generated/egg';
import { useTheme } from '../theme';

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

/**
 * The egg's one shape: the hand-drawn egg doodle (the tab bar's and the launch egg's outline), an
 * ovoid narrower at the top. Its layers are the body, four spots and the ink outline, in a
 * 100-unit box where the egg itself spans `EGG_BOX`.
 */
const [BODY, ...REST] = eggDoodle.layers;
const OUTLINE = REST[REST.length - 1];
const SPOTS = REST.slice(0, -1);
const EGG_BOX = { x: 20, y: 5.5, width: 60, height: 87 } as const;
const SPOT_OPACITY = 0.55;
/* eslint-disable lingui/no-unlocalized-strings -- vector path data, never copy. */
/** The crack across the shell, in the doodle's units (the design's `crack` pose). */
const CRACK = 'M25 50L35 44L42 53L50 43L58 53L65 44L75 50';
const CRACK_WIDTH = 2.6;
/* eslint-enable lingui/no-unlocalized-strings */

function Hatchling({ children }: { readonly children: ReactNode }) {
  const slap = useSlap({ active: true });
  return <Animated.View style={slap}>{children}</Animated.View>;
}

/** The trip egg: rests, wobbles, cracks, then hatches into the guide sticker. */
export function Egg({ state, color, size = 72, hatchling, hatchlingName, testID }: EggProps) {
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const rotate = useSharedValue(0);
  const height = size * HEIGHT_RATIO;
  const wobbling = useIdleLoopRunning(state === 'wobbling');

  useEffect(() => {
    if (
      reduced ||
      state === 'resting' ||
      state === 'hatched' ||
      (state === 'wobbling' && !wobbling)
    ) {
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
  }, [state, reduced, wobbling]);
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

  // Fitted by height and centred, so the egg keeps the footprint it always had.
  const scale = height / EGG_BOX.height;
  const offsetX = (size - EGG_BOX.width * scale) / 2 - EGG_BOX.x * scale;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View style={[{ width: size, height, transformOrigin: 'bottom' }, wobble]}>
        <Canvas style={{ width: size, height }}>
          <Group
            transform={[{ translateX: offsetX }, { translateY: -EGG_BOX.y * scale }, { scale }]}
          >
            {BODY === undefined ? null : (
              <Path path={BODY.d} color={color ?? theme.semantic.action.primary} />
            )}
            {SPOTS.map((spot) => (
              <Path
                key={spot.d}
                path={spot.d}
                color={theme.color.paper.bright}
                opacity={SPOT_OPACITY}
              />
            ))}
            {OUTLINE === undefined ? null : <Path path={OUTLINE.d} color={theme.color.paper.ink} />}
            {state === 'cracking' ? (
              <Path
                path={CRACK}
                style="stroke"
                strokeWidth={CRACK_WIDTH}
                strokeJoin="round"
                strokeCap="round"
                color={theme.color.paper.ink}
              />
            ) : null}
          </Group>
        </Canvas>
      </Animated.View>
    </View>
  );
}
