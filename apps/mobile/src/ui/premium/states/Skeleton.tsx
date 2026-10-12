import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CritterSticker } from '../stickers/CritterSticker';
import { Text } from '../text/Text';
import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface SkeletonProps {
  readonly width?: DimensionValue;
  readonly height: number;
  /** @default half the height (a bar) */
  readonly radius?: number;
  /** `block` shimmers (heroes, images); `bar` and `soft` are the two row bar greys. @default 'bar' */
  readonly tone?: 'block' | 'bar' | 'soft';
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A placeholder in the real layout's shape. Blocks carry the 100° shimmer sweeping across; bars
 * stay still. Reduce Motion stops the sweep. Skeletons are hidden from assistive tech: the screen
 * announces loading once, through `LoadingCritter`.
 */
export function Skeleton({ width = '100%', height, radius, tone = 'bar', style }: SkeletonProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const [measured, setMeasured] = useState(0);
  const sweep = useSharedValue(0);
  const shimmer = tone === 'block' && !reduced;

  useEffect(() => {
    if (!shimmer) return undefined;
    sweep.set(
      withRepeat(
        withTiming(1, { duration: t.motion.shimmerSweepMs, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(sweep);
  }, [shimmer, sweep, t.motion.shimmerSweepMs]);

  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: (sweep.value * 2 - 1) * measured }],
  }));
  const fill =
    tone === 'block'
      ? t.color.skeletonFrom
      : tone === 'bar'
        ? t.color.skeletonBar
        : t.color.skeletonBarSoft;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius ?? height / 2,
          backgroundColor: fill,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {shimmer ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundImage: shimmerGradient(t.color.skeletonFrom, t.color.skeletonTo),
            },
            band,
          ]}
        />
      ) : null}
    </View>
  );
}

/** The design's `linear-gradient(100deg, from 30%, to 50%, from 70%)`. */
function shimmerGradient(from: string, to: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never rendered copy.
  return ['linear-gradient(100deg', `${from} 30%`, `${to} 50%`, `${from} 70%)`].join(', ');
}

export interface LoadingCritterProps {
  /** The progressive line ("Tokek is fetching the plan…"). */
  readonly label: string;
  /** @default the thinking gecko */
  readonly critter?: { readonly kind: string; readonly name: string };
  readonly testID?: string;
}

/** A bobbing thinking critter and a 13/600 muted line, near the bottom of a loading screen. */
export function LoadingCritter({ label, critter, testID }: LoadingCritterProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const lift = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      lift.set(0);
      return undefined;
    }
    lift.set(
      withRepeat(
        withTiming(1, { duration: t.motion.bobMs / 2, easing: Easing.inOut(Easing.cubic) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(lift);
  }, [reduced, lift, t.motion.bobMs]);

  const bob = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * t.motion.bobLift }],
  }));

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.gap8,
      }}
    >
      <Animated.View style={bob}>
        <CritterSticker
          kind={critter?.kind ?? 'gecko'}
          name={critter?.name ?? label}
          size={t.size.loadingCritter}
          pose="think"
          edge={false}
        />
      </Animated.View>
      <Text variant="label" tone="muted">
        {label}
      </Text>
    </View>
  );
}
