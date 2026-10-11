/**
 * The 40 pieces that burst from the stamp's landing (10.02, 1.07): crew colours flung out and
 * falling under gravity, fading as they go. One shared clock drives every piece on the UI thread.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { premium } from '@cp/design-tokens';

const { sun, pink, sky, mint, tangerine } = premium.accent;
const COLOURS = [sun, pink, sky, mint, tangerine] as const;
const DURATION_MS = 1400;
const GRAVITY = 900;

interface Piece {
  readonly id: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly width: number;
  readonly height: number;
  readonly colour: string;
}

/** A fixed spread (the same burst every time): angles round the circle, speeds and sizes varied. */
export function confettiPieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.17;
    const speed = 260 + ((i * 37) % 7) * 45;
    return {
      id: i,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 220,
      spin: ((i % 5) - 2) * 260,
      width: 6 + (i % 3) * 2,
      height: 10 + (i % 4) * 2,
      colour: COLOURS[i % COLOURS.length] ?? COLOURS[0],
    };
  });
}

function ConfettiPiece({
  piece,
  clock,
}: {
  readonly piece: Piece;
  readonly clock: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    return {
      opacity: t === 0 ? 0 : 1 - t * t,
      transform: [
        { translateX: piece.vx * t },
        { translateY: piece.vy * t + GRAVITY * t * t },
        { rotate: `${piece.spin * t}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.width, height: piece.height, backgroundColor: piece.colour },
        style,
      ]}
    />
  );
}

export interface LaunchConfettiProps {
  readonly x: number;
  readonly y: number;
  readonly count: number;
  /** Starts the burst; it plays once. */
  readonly fired: boolean;
}

export function LaunchConfetti({ x, y, count, fired }: LaunchConfettiProps) {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (fired) clock.value = withTiming(1, { duration: DURATION_MS, easing: Easing.linear });
  }, [fired, clock]);
  return (
    <View pointerEvents="none" style={[styles.origin, { left: x, top: y }]}>
      {confettiPieces(count).map((piece) => (
        <ConfettiPiece key={piece.id} piece={piece} clock={clock} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  origin: { position: 'absolute', width: 0, height: 0 },
  piece: { position: 'absolute', borderRadius: 2 },
});
