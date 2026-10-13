/**
 * A light page with a footer that sticks to the bottom (what's in each plan, pushed inside the
 * paywall cover): the ground fills the screen, a glass back circle (or ✕) sits top-left and the
 * title is centred, as the push screen type draws it. The native stack runs the push and its edge
 * swipe; the leading control follows where the page sits (`<` pushed, ✕ as a sheet's first page,
 * the way Home after a cold link).
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, Text, usePremiumTheme } from '@/ui/premium';
import { leadingControlFor, useScreenPlacement } from '@/ui/premium/shell';

const goBack = () => router.back();
const goHome = () => router.replace('/');

export interface DrawnPageProps {
  readonly backLabel: string;
  /** `close` for a one-job page (✕), `back` for a push; by default where the page sits. */
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
  leading,
  onBack,
  title,
  subtitle,
  footer,
  children,
  testID,
}: DrawnPageProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const placed = leadingControlFor(useScreenPlacement());
  const control = leading ?? (placed === 'close' ? 'close' : 'back');
  const leave = onBack ?? (placed === 'home' ? goHome : goBack);
  const top = insets.top + t.space.gap6;
  return (
    <View style={[styles.root, { backgroundColor: t.color.ground }]} testID={testID}>
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
          icon={control}
          label={backLabel}
          kind="nav"
          onPress={leave}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  titles: { flex: 1, alignItems: 'center' },
});
