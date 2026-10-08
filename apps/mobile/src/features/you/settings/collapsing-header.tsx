/**
 * The sticky header of a settings page: as the large title fades into the bar, the header gives
 * its room back, so the first card rides up to the bar and no empty band stays above it.
 */
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

export function CollapsingHeader({
  collapse,
  children,
}: {
  /** 0 with the large title showing, 1 once it has collapsed into the bar. */
  readonly collapse: SharedValue<number>;
  readonly children: ReactNode;
}) {
  const theme = useTheme();
  const [full, setFull] = useState(0);
  const style = useAnimatedStyle(() =>
    full <= MIN_TOUCH_TARGET ? {} : { height: full - (full - MIN_TOUCH_TARGET) * collapse.value },
  );
  return (
    <Animated.View style={[{ backgroundColor: theme.semantic.bg.base, overflow: 'hidden' }, style]}>
      <View onLayout={(event) => setFull(event.nativeEvent.layout.height)}>{children}</View>
    </Animated.View>
  );
}
