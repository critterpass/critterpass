/**
 * A sheet that rises over a premium screen (the MVP vote, a reaction, sharing, the postcard's note): the scrim
 * closes it, a grabber and ✕ sit on top, a drag down on its top band puts it away (it springs back
 * when let go early), the content scrolls when it is tall, and the keyboard pushes it up.
 * Undesigned in the premium set, built from the kit's sheet radius and ground.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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
  REDUCED_FADE,
  SPRINGS,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
} from '@/ui/premium';

// eslint-disable-next-line critterpass/no-literal-style, lingui/no-unlocalized-strings -- the sheet scrim the premium tokens do not carry yet
const SHEET_SCRIM = 'rgba(20,22,40,.3)';

const useStyles = makePremiumStyles((th) => ({
  sheet: {
    marginHorizontal: 8,
    marginBottom: 8,
    maxHeight: '86%',
    paddingTop: 10,
    paddingHorizontal: 20,
    borderRadius: th.radius.sheet,
    backgroundColor: th.color.ground,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: th.color.outlineEmpty,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 12 },
  fill: { flex: 1 },
}));

/** How far (pt) or how fast (pt/s) a drag down goes before the sheet is put away. */
const DISMISS_PT = 110;
const DISMISS_SPEED = 900;
/** Where a dismissed sheet travels to before it closes: past any phone's height. */
const AWAY_PT = 900;

/** The drag on the sheet's top band: follows the finger down, closes past the line, else settles. */
function useDragToDismiss(onClose: () => void) {
  const reduced = usePremiumReducedMotion();
  const y = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-8)
    .onUpdate((event) => {
      'worklet';
      y.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationY > DISMISS_PT || event.velocityY > DISMISS_SPEED) {
        y.value = withTiming(AWAY_PT, REDUCED_FADE);
        scheduleOnRN(onClose);
        return;
      }
      y.value = reduced ? withTiming(0, REDUCED_FADE) : withSpring(0, SPRINGS.snappy);
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return { pan, style };
}

export function PremiumSheet({
  title,
  onClose,
  children,
  scroll = true,
  testID,
}: {
  /** False for a sheet whose content takes drags itself (a signature pad). */
  readonly scroll?: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const drag = useDragToDismiss(onClose);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.fill}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: SHEET_SCRIM }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'recap.premium.sheet.close', message: 'Close' })}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }, drag.style]}
            testID={testID}
          >
            <GestureDetector gesture={drag.pan}>
              <View>
                <View style={styles.grabber} />
                <View style={styles.head}>
                  <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                    {title}
                  </Text>
                  <GlassIconButton
                    icon="close"
                    label={t({ id: 'recap.premium.sheet.close', message: 'Close' })}
                    onPress={onClose}
                  />
                </View>
              </View>
            </GestureDetector>
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
                {children}
              </ScrollView>
            ) : (
              <View style={{ gap: 10 }}>{children}</View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
