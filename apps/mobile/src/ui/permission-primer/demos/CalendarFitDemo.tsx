import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTheme } from '../../theme';
import { ramp } from './ramp';
import { DEMO_SIZE, useDemoLoop } from './use-demo-loop';

const BARS = [0.62, 0.78, 0.55, 0.84, 0.46];

/** CALENDAR: everyone's availability bars, and the week that fits pulsing below (1.4 s). */
export function CalendarFitDemo() {
  const theme = useTheme();
  const progress = useDemoLoop(1400);
  const fitStyle = useAnimatedStyle(() => ({
    opacity: ramp(progress.value, [0, 0.5, 1], [0.55, 1, 1]),
    transform: [{ scaleX: ramp(progress.value, [0, 0.5, 1], [0.9, 1.06, 1]) }],
  }));
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.semantic.bg.sunken }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {BARS.map((width, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            { width: (DEMO_SIZE - 20) * width, backgroundColor: theme.color.blue },
          ]}
        />
      ))}
      <Animated.View style={[styles.fit, { backgroundColor: theme.color.yellow }, fitStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: DEMO_SIZE,
    height: DEMO_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bar: { height: 6, borderRadius: 3 },
  fit: { height: 7, width: 22, borderRadius: 4, marginTop: 2 },
});
