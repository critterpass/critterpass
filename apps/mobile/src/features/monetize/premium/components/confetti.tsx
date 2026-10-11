/**
 * A one-shot confetti burst from a point (3.09, 9.14, 9.15): pieces fly out and fall, Lively, then
 * go. Nothing under Reduce Motion.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';
import { MONETIZE_TIMING } from '../monetize-palette';

export interface ConfettiProps {
  readonly fire: boolean;
  /** Origin as fractions of the host. */
  readonly x: number;
  readonly y: number;
  readonly count?: number;
  readonly delay?: number;
}

interface Piece {
  readonly dx: number;
  readonly dy: number;
  readonly turn: number;
  readonly color: string;
  readonly w: number;
  readonly h: number;
}

function PieceView({ piece, t }: { readonly piece: Piece; readonly t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const k = t.value;
    return {
      opacity: k < 0.75 ? 1 : (1 - k) * 4,
      transform: [
        { translateX: piece.dx * k },
        // Up and out, then gravity.
        { translateY: piece.dy * k + 420 * k * k },
        { rotate: `${String(piece.turn * k)}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.w, height: piece.h, backgroundColor: piece.color },
        style,
      ]}
    />
  );
}

export function Confetti({ fire, x, y, count = 44, delay = 0 }: ConfettiProps) {
  const reduced = usePremiumReducedMotion();
  const th = usePremiumTheme();
  const t = useSharedValue(0);
  const pieces = useMemo<Piece[]>(() => {
    const colours = [
      th.accent.sun,
      th.accent.pink,
      th.accent.sky,
      th.accent.mint,
      th.accent.tangerine,
    ];
    return Array.from({ length: count }, (_u, i) => {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.3;
      const speed = 120 + ((i * 37) % 140);
      return {
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 160,
        turn: ((i * 53) % 540) - 270,
        color: colours[i % colours.length] ?? th.accent.sun,
        w: i % 2 === 0 ? 8 : 6,
        h: i % 2 === 0 ? 5 : 9,
      };
    });
  }, [count, th.accent]);

  useEffect(() => {
    if (!fire || reduced) return;
    t.set(
      withDelay(
        delay,
        withTiming(1, { duration: MONETIZE_TIMING.confetti, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [fire, reduced, delay, t]);

  if (!fire || reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.origin, { left: `${String(x * 100)}%`, top: `${String(y * 100)}%` }]}>
        {pieces.map((piece, i) => (
          <PieceView key={i} piece={piece} t={t} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  origin: { position: 'absolute', width: 0, height: 0 },
  piece: { position: 'absolute', borderRadius: 1.5 },
});
