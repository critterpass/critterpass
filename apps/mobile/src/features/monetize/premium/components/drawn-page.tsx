/**
 * A light page drawn by the screen itself, for routes presented see-through in the `(modal)`
 * group: the ground fills the screen, the page slides in on Smooth (a fade under Reduce Motion),
 * a glass back circle (or ✕) sits top-left and the title is centred, as the push screen type
 * draws it.
 */
import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

export interface DrawnPageProps {
  readonly backLabel: string;
  /** `close` for a one-job page (✕), `back` for a push. */
  readonly leading?: 'back' | 'close';
  readonly onBack?: () => void;
  readonly title?: string;
  readonly subtitle?: string;
  /** Sticks to the bottom (the page's main buttons). */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function DrawnPage({
  backLabel,
  leading = 'back',
  onBack,
  title,
  subtitle,
  footer,
  children,
  testID,
}: DrawnPageProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.smooth));
  }, [reduced, shown]);
  const page = useAnimatedStyle(() => ({
    opacity: reduced ? shown.value : 1,
    transform: [{ translateX: reduced ? 0 : 60 * (1 - shown.value) }],
  }));
  const top = insets.top + t.space.gap6;
  return (
    <Animated.View style={[styles.root, { backgroundColor: t.color.ground }, page]} testID={testID}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: top + t.size.glassNav + t.space.gap12,
          paddingHorizontal: t.space.gutter,
          paddingBottom: t.space.gap16,
          gap: t.space.gap16,
        }}
      >
        {children}
      </ScrollView>
      {footer === undefined ? null : (
        <View
          style={{
            paddingHorizontal: t.space.titleGutter,
            paddingTop: t.space.gap8,
            paddingBottom: insets.bottom + t.space.gap12,
            gap: t.space.gap8,
          }}
        >
          {footer}
        </View>
      )}
      <View
        style={[styles.bar, { top, paddingHorizontal: t.space.gutter }]}
        pointerEvents="box-none"
      >
        <GlassIconButton
          icon={leading}
          label={backLabel}
          kind="nav"
          onPress={onBack ?? (() => router.back())}
          testID="drawn-page-back"
        />
        <View style={styles.titles} pointerEvents="none">
          {title === undefined ? null : (
            <Text variant="navTitle" align="center" numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          )}
          {subtitle === undefined ? null : (
            <Text variant="navSubtitle" tone="muted" align="center" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={{ width: t.size.glassNav }} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  titles: { flex: 1, alignItems: 'center' },
});
