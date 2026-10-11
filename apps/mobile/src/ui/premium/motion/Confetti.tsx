import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { premium } from '@cp/design-tokens';

import { SPRINGS } from './springs';

const { confettiPieces, confettiReach, confettiFall } = premium.motion.stamp;

/** The burst's colours: the crew accents (the design's confetti palette). */
const COLOURS = [
  premium.accent.sun,
  premium.accent.pink,
  premium.accent.sky,
  premium.accent.mint,
  premium.accent.neutral,
  premium.accent.tangerine,
];

export interface ConfettiPiece {
  /** Unit direction of flight (mostly upward, a 2.2 rad fan around straight up). */
  readonly dx: number;
  readonly dy: number;
  /** Share of the full reach this piece travels (5–14 of 14 in the design's speeds). */
  readonly reach: number;
  readonly spin: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
}

/** A small seeded generator so a burst looks the same on every render of the same seed. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pieces of one burst: the design's fan, speeds, sizes and colour cycle. */
export function burstPieces(seed = 1, count = confettiPieces): readonly ConfettiPiece[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (rand() - 0.5) * 2.2;
    return {
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      reach: (5 + rand() * 9) / 14,
      spin: (rand() - 0.5) * 8,
      width: 5 + rand() * 6,
      height: 3 + rand() * 4,
      color: COLOURS[i % COLOURS.length] ?? premium.accent.sun,
    };
  });
}

function Piece({
  piece,
  burst,
}: {
  readonly piece: ConfettiPiece;
  readonly burst: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: p <= 0 ? 0 : interpolate(p, [0, 0.5, 1], [1, 1, 0], 'clamp'),
      transform: [
        { translateX: piece.dx * confettiReach * piece.reach * p },
        { translateY: piece.dy * confettiReach * piece.reach * p + confettiFall * p * p },
        { rotate: `${String(piece.spin * p)}rad` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.width, height: piece.height, backgroundColor: piece.color },
        style,
      ]}
    />
  );
}

export interface ConfettiProps {
  /** Each new value bursts once; `0` holds still. */
  readonly fire: number;
  readonly seed?: number;
}

/**
 * The stamp moment's confetti: 44 pieces burst from the centre, fly out and fall away as they fade.
 * One Smooth spring drives the whole burst. Callers skip it under Reduce Motion.
 */
export function Confetti({ fire, seed = 1 }: ConfettiProps) {
  const burst = useSharedValue(0);
  useEffect(() => {
    if (fire === 0) return;
    burst.set(0);
    burst.set(withSpring(1, SPRINGS.smooth));
  }, [burst, fire]);
  const pieces = useMemo(() => burstPieces(seed + fire), [seed, fire]);
  return (
    <View style={styles.layer} pointerEvents="none">
      {pieces.map((piece, i) => (
        <Piece key={String(i)} piece={piece} burst={burst} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
});
