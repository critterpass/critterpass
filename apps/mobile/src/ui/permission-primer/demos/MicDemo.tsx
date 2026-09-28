import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '../../theme';
import { ramp } from './ramp';
import { DEMO_SIZE, useDemoLoop } from './use-demo-loop';

const PHASES = [0, 0.3, 0.6, 0.15, 0.45];

function Bar({
  progress,
  phase,
  color,
}: {
  readonly progress: SharedValue<number>;
  readonly phase: number;
  readonly color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = (progress.value + phase) % 1;
    return { transform: [{ scaleY: ramp(p, [0, 0.5, 1], [0.35, 1, 0.35]) }] };
  });
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

/** MICROPHONE: a waveform that moves while you hold to talk (reduced motion: mid-word frame). */
export function MicDemo() {
  const theme = useTheme();
  const progress = useDemoLoop(1200);
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.semantic.bg.sunken }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {PHASES.map((phase) => (
        <Bar key={phase} progress={progress} phase={phase} color={theme.color.green.base} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: DEMO_SIZE,
    height: DEMO_SIZE,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  bar: { width: 6, height: 36, borderRadius: 3 },
});
