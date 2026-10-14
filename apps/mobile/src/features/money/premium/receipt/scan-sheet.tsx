/**
 * The light sheet over the dark camera (7.19): top corners 34, a grabber, the ground colour even in
 * the dark frame. It rises on Smooth when it first shows (Reduce Motion: a 150 ms fade) and keeps
 * clear of the home indicator.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { reducedFadeIn, usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';

function riseIn(reduced: boolean, spring: { stiffness: number; damping: number; mass: number }) {
  if (reduced) return reducedFadeIn();
  return SlideInDown.springify()
    .stiffness(spring.stiffness)
    .damping(spring.damping)
    .mass(spring.mass);
}

export function ScanSheet({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  return (
    <Animated.View
      entering={riseIn(reduced, th.spring.smooth)}
      style={[
        styles.sheet,
        {
          backgroundColor: th.color.ground,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: 20,
    paddingTop: 8,
    gap: 12,
    maxHeight: 620,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
});
