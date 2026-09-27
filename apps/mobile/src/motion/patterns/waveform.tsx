import { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';

const MIN_HEIGHT_FRACTION = 0.15;

/**
 * One waveform bar's height style, driven by a real audio-level shared value the caller owns (e.g.
 * the music engine's level meter — docs/design-system.md §4: "bars on the playing theme move with
 * real audio level"). `barIndex`/`barCount` phase-shift each bar slightly so a single level value
 * still reads as a waveform rather than one flat block; a caller renders one bar per index
 * (`Array.from({ length: barCount }).map((_, i) => <Bar key={i} index={i} .../>)`) so each bar's
 * hook count stays fixed regardless of `barCount` changing.
 */
export function useWaveformBar(level: SharedValue<number>, barIndex: number, barCount: number) {
  const phase = barCount > 0 ? (barIndex / barCount) * Math.PI : 0;
  const heightFraction = useDerivedValue(() => {
    const wobble = 0.75 + 0.25 * Math.sin(phase);
    return MIN_HEIGHT_FRACTION + level.value * wobble * (1 - MIN_HEIGHT_FRACTION);
  });

  return useAnimatedStyle(() => ({ transform: [{ scaleY: heightFraction.value }] }));
}
