import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon } from '../../icons/Icon';
import { useTheme } from '../../theme';
import { ramp } from './ramp';
import { DEMO_SIZE, useDemoLoop } from './use-demo-loop';

function Ring({
  progress,
  offset,
  color,
}: {
  readonly progress: SharedValue<number>;
  readonly offset: number;
  readonly color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = (progress.value + offset) % 1;
    return {
      opacity: ramp(p, [0, 1], [0.7, 0]),
      transform: [{ scale: ramp(p, [0, 1], [0.4, 1.3]) }],
    };
  });
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

/** LOCATION, ON TRIPS: a green ping ring pulses behind a locked phone's critter silhouette (2 s). */
export function CritterPingDemo() {
  const theme = useTheme();
  const progress = useDemoLoop(2000);
  const green = theme.semantic.state.success;
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.semantic.bg.sunken }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Ring progress={progress} offset={0} color={green} />
      <Ring progress={progress} offset={0.5} color={green} />
      <View style={[styles.phone, { borderColor: theme.semantic.border.control }]}>
        <Icon name="lock" size={24} decorative />
      </View>
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
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    width: DEMO_SIZE - 8,
    height: DEMO_SIZE - 8,
    borderRadius: DEMO_SIZE,
    borderWidth: 3,
  },
  phone: {
    width: 34,
    height: 52,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
