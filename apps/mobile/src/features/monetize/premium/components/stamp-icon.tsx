/**
 * The Stamp app icon drawn in place (the Pass+ icon style): a night seal with a gold ring and the
 * gecko cheering in sun ink, optionally inside the spinning holographic ring (9.10, 9.15). Stands
 * in until the brand lane ships the icon's own art.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { CritterSticker, usePremiumReducedMotion } from '@/ui/premium';
import { MONETIZE_TIMING } from '../monetize-palette';

export interface StampIconProps {
  readonly size: number;
  /** Round (in a ring) or the iOS icon squircle. */
  readonly shape?: 'circle' | 'icon';
  /** The spinning holographic ring around it. */
  readonly holo?: boolean;
  readonly label: string;
}

const HOLO = 'conic-gradient(#ff5fa8, #ffd84a, #54d6a4, #4f86ff, #ff5fa8)';

export function StampIcon({ size, shape = 'circle', holo = false, label }: StampIconProps) {
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!holo || !looping) {
      cancelAnimation(turn);
      turn.set(0);
      return;
    }
    turn.set(
      withRepeat(
        withTiming(360, { duration: MONETIZE_TIMING.holoTurn, easing: Easing.linear }),
        -1,
      ),
    );
  }, [holo, looping, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${String(turn.value)}deg` }] }));
  const outer = holo ? size * 1.15 : size;
  const seal = (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? size / 2 : size * 0.2237,
        experimental_backgroundImage: 'radial-gradient(circle at 50% 30%, #34305a, #141226 78%)',
        boxShadow: `inset 0 0 0 ${String(size * 0.035)}px #e2a92a, inset 0 0 0 ${String(size * 0.08)}px rgba(255,216,74,0.25), 0 6px 14px rgba(0,0,0,0.4)`,
        alignItems: 'center',
        justifyContent: 'flex-end',
        overflow: 'hidden',
      }}
    >
      <CritterSticker kind="gecko" name={label} size={size * 0.74} pose="cheer" edge={false} />
    </View>
  );
  if (!holo) return seal;
  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            experimental_backgroundImage: HOLO,
            opacity: 0.75,
          },
          spin,
        ]}
      />
      {seal}
    </View>
  );
}
