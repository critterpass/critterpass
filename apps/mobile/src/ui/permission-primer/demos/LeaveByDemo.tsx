import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { Text } from '../../text/Text';
import { useTheme } from '../../theme';
import { ramp } from './ramp';
import { DEMO_SIZE, useDemoLoop } from './use-demo-loop';

/** ALARMS AND PINGS: a "LEAVE BY 03:10" card drops in, holds, and drops out on a 4 s loop. */
export function LeaveByDemo() {
  const theme = useTheme();
  const progress = useDemoLoop(4000);
  const cardStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // In over the first 15 %, hold, out over the last 10 % (the reduced-motion frame is held).
    const y =
      p < 0.15 ? ramp(p, [0, 0.15], [-28, 0]) : p > 0.9 && p < 1 ? ramp(p, [0.9, 1], [0, 28]) : 0;
    const opacity =
      p < 0.15 ? ramp(p, [0, 0.15], [0, 1]) : p > 0.9 && p < 1 ? ramp(p, [0.9, 1], [1, 0]) : 1;
    return { opacity, transform: [{ translateY: y }] };
  });
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.semantic.bg.sunken }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.card, { backgroundColor: theme.color.ink['950'] }, cardStyle]}>
        <Text
          variant="eyebrow"
          color={theme.color.yellow}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {t({ id: 'permissions.demo.leaveBy', message: 'Leave by' })}
        </Text>
        <Text
          variant="title"
          color={theme.color.paper.base}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          03:10
        </Text>
      </Animated.View>
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
  card: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: DEMO_SIZE - 12 },
});
