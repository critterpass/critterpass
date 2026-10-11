/**
 * The designed alert (3.15, 9.08, 9.22): a glass card over a dimmed, softly blurred page, a hero
 * (avatar or sticker) on top, the question as the title, the result as lines, two stacked buttons.
 * The system alert can't carry the hero or lines, so this one is drawn. Enters on Smooth (scale
 * 1.08 → 1 with a fade); Reduce Motion fades.
 */
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  GlassSurface,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { MONETIZE_INK } from '../monetize-palette';

export interface GlassAlertProps {
  readonly visible: boolean;
  readonly hero?: ReactNode;
  readonly title: string;
  readonly body?: ReactNode;
  /** The buttons, top first (primary then the way back). */
  readonly actions: ReactNode;
  readonly onDismiss: () => void;
  readonly dismissLabel: string;
  readonly testID?: string;
}

export function GlassAlert({
  visible,
  hero,
  title,
  body,
  actions,
  onDismiss,
  dismissLabel,
  testID,
}: GlassAlertProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    shown.set(0);
    shown.set(reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.smooth));
  }, [visible, reduced, shown]);
  const card = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value),
    transform: [{ scale: reduced ? 1 : 1.08 - 0.08 * shown.value }],
  }));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        style={[StyleSheet.absoluteFill, { backgroundColor: MONETIZE_INK.scrim }]}
      />
      <View pointerEvents="box-none" style={styles.centre}>
        <Animated.View testID={testID} style={[styles.card, card]} accessibilityViewIsModal>
          <GlassSurface
            kind="sheet"
            style={[StyleSheet.absoluteFill, { borderRadius: 36, overflow: 'hidden' }]}
          />
          <View style={{ padding: 22, paddingTop: 26, gap: 10, alignItems: 'center' }}>
            {hero}
            <Text variant="title" align="center" accessibilityRole="header">
              {title}
            </Text>
            {body}
            <View style={{ alignSelf: 'stretch', gap: t.space.gap8, marginTop: 6 }}>{actions}</View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS shadow, never copy.
  card: { borderRadius: 36, boxShadow: '0 40px 80px -20px rgba(20,22,40,0.5)' },
});
