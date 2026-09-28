import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTheme } from '../../theme';
import { ramp } from './ramp';
import { DEMO_SIZE, useDemoLoop } from './use-demo-loop';

/** CAMERA: a viewfinder whose shutter flashes once per loop (reduced motion: the framed shot). */
export function CameraDemo() {
  const theme = useTheme();
  const progress = useDemoLoop(2400);
  const flash = useAnimatedStyle(() => ({
    opacity: ramp(progress.value, [0, 0.8, 0.85, 1], [0, 0, 0.8, 0]),
  }));
  const corner = { borderColor: theme.semantic.text.primary };
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.semantic.bg.sunken }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.corner, styles.tl, corner]} />
      <View style={[styles.corner, styles.tr, corner]} />
      <View style={[styles.corner, styles.bl, corner]} />
      <View style={[styles.corner, styles.br, corner]} />
      <View style={[styles.subject, { backgroundColor: theme.color.pink }]} />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.paper.base }, flash]}
      />
    </View>
  );
}

const C = 16;
const styles = StyleSheet.create({
  tile: {
    width: DEMO_SIZE,
    height: DEMO_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  corner: { position: 'absolute', width: C, height: C, borderColor: 'transparent' },
  tl: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3 },
  subject: { width: 30, height: 30, borderRadius: 15 },
});
