/**
 * Draws the designed dialogs from `dialogQueue` where the platform's own would show a stock
 * Material dialog: the confirm card (3.15: the question centred, the action as a pink-tint pill
 * when it destroys something, the way back as the ink pill under it), a notice with one ink pill,
 * and the options sheet (7.15: one grouped card of centred actions over a separate Close card),
 * which iOS draws too in place of its centred alert.
 * Each sits in its own transparent modal, so it shows over sheets and other modals too.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PressableScale, Text, usePremiumTheme } from '../..';
import { dialogQueue, type OptionsDialog, type QueuedDialog } from './dialog-queue';

export function DialogHost() {
  useEffect(() => dialogQueue.attach(), []);
  const shown = useSyncExternalStore(dialogQueue.subscribe, dialogQueue.current);
  if (shown === null) return null;
  const end = (chosen: boolean) => dialogQueue.settle(shown.id, chosen);
  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => end(false)}
    >
      <Dialog key={shown.id} shown={shown} end={end} />
    </Modal>
  );
}

function Dialog({
  shown,
  end,
}: {
  readonly shown: QueuedDialog;
  readonly end: (chosen: boolean) => void;
}) {
  const t = usePremiumTheme();
  const { spec } = shown;
  const scrim = (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(160)}
      style={[StyleSheet.absoluteFill, { backgroundColor: t.color.scrim }]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => end(false)}
        accessibilityRole="button"
        accessibilityLabel={
          spec.kind === 'confirm' ? spec.cancel : spec.kind === 'notice' ? spec.ok : spec.close
        }
      />
    </Animated.View>
  );
  if (spec.kind === 'options') {
    return (
      <View style={styles.fill}>
        {scrim}
        <OptionsCard spec={spec} end={end} />
      </View>
    );
  }
  return (
    <View style={[styles.fill, styles.centre]}>
      {scrim}
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(140)}
        accessibilityViewIsModal
        style={[
          styles.card,
          {
            borderRadius: t.radius.hero,
            backgroundColor: t.color.card,
            boxShadow: t.shadow.toast,
            gap: t.space.gap12,
          },
        ]}
        testID="premium-dialog"
      >
        {spec.kind === 'confirm' && spec.badge !== undefined ? (
          <View style={styles.badge}>{spec.badge}</View>
        ) : null}
        <Text variant="title" align="center" accessibilityRole="header">
          {spec.title}
        </Text>
        {spec.message === undefined || spec.message === '' ? null : (
          <Text variant="rowText" tone="muted" align="center">
            {spec.message}
          </Text>
        )}
        <View style={{ gap: t.space.gap10, marginTop: t.space.gap8 }}>
          {spec.kind === 'confirm' ? (
            <>
              <Button
                label={spec.confirm}
                variant={spec.destructive ? 'destructive' : 'primary'}
                onPress={() => end(true)}
                testID="premium-dialog-confirm"
              />
              <Button
                label={spec.cancel}
                variant={spec.destructive ? 'primary' : 'control'}
                onPress={() => end(false)}
                testID="premium-dialog-cancel"
              />
            </>
          ) : (
            <Button label={spec.ok} onPress={() => end(true)} testID="premium-dialog-ok" />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function OptionsCard({
  spec,
  end,
}: {
  readonly spec: OptionsDialog;
  readonly end: (chosen: boolean) => void;
}) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const group = {
    borderRadius: t.radius.cardLarge,
    backgroundColor: t.color.card,
    overflow: 'hidden' as const,
  };
  return (
    <Animated.View
      entering={SlideInDown.duration(220)}
      exiting={SlideOutDown.duration(180)}
      accessibilityViewIsModal
      style={[styles.sheet, { paddingBottom: insets.bottom + t.space.gap8, gap: t.space.gap10 }]}
      testID="premium-options"
    >
      <View style={group}>
        {spec.header === undefined ? null : (
          <View style={[styles.optionHead, { borderBottomColor: t.color.hairline }]}>
            <Text variant="label" tone="muted" align="center">
              {spec.header}
            </Text>
          </View>
        )}
        {spec.options.map((option, index) => (
          <PressableScale
            key={option.label}
            pressedScale={1}
            onPress={() => {
              end(true);
              option.run();
            }}
            accessibilityLabel={option.label}
            testID={`premium-options-${String(index)}`}
            style={[
              styles.option,
              index === 0 && spec.header === undefined
                ? null
                : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.hairline },
            ]}
          >
            <Text
              variant="headline"
              align="center"
              color={option.destructive === true ? t.color.destructive.text : t.color.ink}
              style={styles.optionWords}
            >
              {option.label}
            </Text>
          </PressableScale>
        ))}
      </View>
      <PressableScale
        onPress={() => end(false)}
        accessibilityLabel={spec.close}
        testID="premium-options-close"
        style={[group, styles.option]}
      >
        <Text variant="button" align="center">
          {spec.close}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  centre: { justifyContent: 'center', paddingHorizontal: 30 },
  card: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18 },
  badge: { alignSelf: 'center', marginTop: -4 },
  sheet: { paddingHorizontal: 10 },
  optionHead: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  option: { minHeight: 57, justifyContent: 'center', paddingHorizontal: 16 },
  optionWords: { fontWeight: '400' },
});
