/**
 * The celebration ground of the befriended and hatch scenes: a disc of rays turning slowly behind
 * the sticker, and a one-off burst of confetti from a point of the screen. Both rest under Reduce
 * Motion (the rays still, the confetti not drawn).
 */
import { Canvas, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { premium } from '@cp/design-tokens';
import { usePremiumReducedMotion } from '@/ui/premium';

import { Spin } from './loops';

/** 20 wedges of 9° with 9° gaps, as one path centred in a `size` square. */
function wedges(size: number) {
  const path = Skia.Path.Make();
  const c = size / 2;
  for (let i = 0; i < 20; i += 1) {
    const a = (i * 18 * Math.PI) / 180;
    const b = ((i * 18 + 9) * Math.PI) / 180;
    path.moveTo(c, c);
    path.lineTo(c + c * Math.cos(a), c + c * Math.sin(a));
    path.lineTo(c + c * Math.cos(b), c + c * Math.sin(b));
    path.close();
  }
  return path;
}

export function Rays({
  size = 700,
  color,
  ms,
  centerY,
}: {
  readonly size?: number;
  /** The ray colour at full strength (faded out by a radial mask from 18% to 62%). */
  readonly color: string;
  readonly ms: number;
  /** The centre's distance from the top of the screen. */
  readonly centerY: number;
}) {
  const { width } = useWindowDimensions();
  const path = useMemo(() => wedges(size), [size]);
  return (
    <Spin
      ms={ms}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        left: width / 2 - size / 2,
        top: centerY - size / 2,
      }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Path path={path}>
          <RadialGradient
            c={vec(size / 2, size / 2)}
            r={size / 2}
            colors={['transparent', color, color, 'transparent']}
            positions={[0, 0.18, 0.4, 0.62]}
          />
        </Path>
      </Canvas>
    </Spin>
  );
}

const PIECE_COLOURS = [
  premium.accent.sun,
  premium.accent.pink,
  premium.accent.sky,
  premium.accent.mint,
  premium.accent.tangerine,
];

function Piece({
  index,
  x,
  y,
}: {
  readonly index: number;
  readonly x: number;
  readonly y: number;
}) {
  const p = useSharedValue(0);
  // A fixed spread per piece (no randomness, so every run lands the same).
  const angle = (index * 137.5 * Math.PI) / 180;
  const reach = 90 + ((index * 53) % 140);
  const dx = Math.cos(angle) * reach;
  const dy = Math.sin(angle) * reach * 0.7;
  useEffect(() => {
    p.value = withDelay(
      (index % 6) * 20,
      withTiming(1, { duration: 1600 + (index % 5) * 160, easing: Easing.out(Easing.quad) }),
    );
  }, [index, p]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value * p.value,
    transform: [
      { translateX: dx * p.value },
      { translateY: dy * p.value + 260 * p.value * p.value },
      { rotate: `${index * 47 + 540 * p.value}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - 4,
          top: y - 5,
          width: index % 3 === 0 ? 7 : 8,
          height: index % 3 === 0 ? 7 : 11,
          borderRadius: index % 3 === 0 ? 4 : 2,
          backgroundColor: PIECE_COLOURS[index % PIECE_COLOURS.length],
        },
        style,
      ]}
    />
  );
}

/** `count` pieces bursting from (`fx`, `fy`), fractions of the screen. */
export function Confetti({
  count,
  fx,
  fy,
}: {
  readonly count: number;
  readonly fx: number;
  readonly fy: number;
}) {
  const reduced = usePremiumReducedMotion();
  const { width, height } = useWindowDimensions();
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <Piece key={i} index={i} x={width * fx} y={height * fy} />
      ))}
    </View>
  );
}
