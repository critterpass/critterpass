/**
 * A sheet the page draws itself, for screens presented see-through over the page that opened them
 * (the `(modal)` group, the seat-limit presenter): the page dims, a sheet-glass panel inset 8 with a
 * 46 corner rises on Smooth, grabber on top, Cancel left and a centred title. Dragging it down or
 * tapping the dimmed page cancels; it leaves on the same Smooth spring it rose on, carrying the
 * drag's speed. Reduce Motion: a 150 ms fade.
 */
import { useCallback, useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
  GlassIconButton,
  GlassSurface,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { MONETIZE_INK, MONETIZE_TIMING } from '../monetize-palette';

export interface ModalSheetProps {
  readonly cancelLabel: string;
  readonly onCancel: () => void;
  readonly title?: string;
  readonly subtitle?: string;
  /** Sticks under the scrolling content (the sheet's main button). */
  readonly footer?: ReactNode;
  /** Something that hangs over the sheet's top edge (a critter). */
  readonly overhang?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
}

const DISMISS_AT = 120;

export function ModalSheet({
  cancelLabel,
  onCancel,
  title,
  subtitle,
  footer,
  overhang,
  children,
  testID,
}: ModalSheetProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const y = useSharedValue(reduced ? 0 : height);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      fade.set(withTiming(1, REDUCED_FADE));
      return;
    }
    fade.set(withTiming(1, { duration: MONETIZE_TIMING.sheetFadeIn }));
    y.set(withSpring(0, SPRINGS.smooth));
  }, [reduced, fade, y, height]);

  const close = useCallback(
    (velocity = 0) => {
      if (reduced) {
        fade.set(withTiming(0, REDUCED_FADE, () => scheduleOnRN(onCancel)));
        return;
      }
      fade.set(withTiming(0, { duration: MONETIZE_TIMING.sheetFadeOut }));
      // Clamped so the sheet never bounces back into view on the way out.
      y.set(
        withSpring(height, { ...SPRINGS.smooth, velocity, overshootClamping: true }, () =>
          scheduleOnRN(onCancel),
        ),
      );
    },
    [reduced, fade, y, height, onCancel],
  );

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_AT || e.velocityY > 900) scheduleOnRN(close, e.velocityY);
      else y.set(withSpring(0, SPRINGS.smooth));
    });

  const scrim = useAnimatedStyle(() => ({ opacity: fade.value }));
  const panel = useAnimatedStyle(() => ({
    opacity: reduced ? fade.value : 1,
    transform: [{ translateY: y.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={() => close()}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          { bottom: Math.max(8, insets.bottom - 18), top: insets.top + 40 },
          panel,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.fill} pointerEvents="box-none" />
        <View
          style={[
            styles.sheet,
            { borderRadius: t.radius.sheet, boxShadow: t.materialShadow.sheet },
          ]}
        >
          <GlassSurface
            kind="sheet"
            style={[StyleSheet.absoluteFill, { borderRadius: t.radius.sheet }]}
          />
          {overhang}
          <GestureDetector gesture={pan}>
            <View style={styles.head}>
              <View style={[styles.grabber, { backgroundColor: t.color.outlineEmpty }]} />
              <View style={styles.headRow}>
                <View style={styles.side}>
                  <GlassIconButton
                    icon="close"
                    label={cancelLabel}
                    onPress={() => close()}
                    testID="modal-sheet-cancel"
                  />
                </View>
                <View style={styles.titles}>
                  {title === undefined ? null : (
                    <Text
                      variant="headline"
                      align="center"
                      numberOfLines={1}
                      accessibilityRole="header"
                    >
                      {title}
                    </Text>
                  )}
                  {subtitle === undefined ? null : (
                    <Text variant="caption" tone="muted" align="center" numberOfLines={1}>
                      {subtitle}
                    </Text>
                  )}
                </View>
                <View style={styles.side} />
              </View>
            </View>
          </GestureDetector>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }}
            bounces={false}
          >
            {children}
          </ScrollView>
          {footer === undefined ? null : (
            <View style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 6 }}>
              {footer}
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: MONETIZE_INK.scrim },
  panel: { position: 'absolute', left: 8, right: 8 },
  fill: { flex: 1 },
  sheet: { maxHeight: '100%', overflow: 'visible' },
  head: { paddingTop: 8, paddingHorizontal: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  side: { width: 80 },
  titles: { flex: 1, alignItems: 'center' },
  scroll: { flexGrow: 0 },
});
