/**
 * The crew chat composer (5.01, 5.08): a `+` for photos, polls, expenses and more; the field
 * ("Message, or @tokek") with the gecko sticker button inside it (ringed in ink while the tray is
 * open, so the gecko keeps its sun disc and never reads as a black face); and
 * the mic, which turns into the ink send button once there is something to send. Return inserts a
 * new line; send sends. The bar carries the reply strip above the field. The placeholder is drawn
 * beside the field's caret rather than by the field, which puts the caret over its first letter.
 */
import { t } from '@lingui/core/macro';
import * as Haptics from 'expo-haptics';
import { forwardRef, type ReactNode, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import {
  CritterSticker,
  Icon,
  PressableScale,
  hitSlopFor,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { MESSAGE_BODY_MAX as BODY_MAX } from '@cp/domain';
import { ring } from '../premium-paint';

const FIELD = 40;
const SIDE = 38;
const STICKER_BUTTON = 32;
const SIDE_SLOP = hitSlopFor(SIDE, SIDE);
const STICKER_SLOP = hitSlopFor(STICKER_BUTTON, STICKER_BUTTON);
const STRIP_SLOP = hitSlopFor(16, 16);
/** The field's text starts at its edge, where the caret stands; the placeholder clears it. */
const CARET_CLEARANCE = 3;
const INPUT_PAD_V = 10;

const useStyles = makePremiumStyles((th) => ({
  bar: { paddingHorizontal: th.space.gap12, paddingTop: th.space.gap10, gap: th.space.gap8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: th.space.gap8 },
  plus: {
    width: SIDE,
    height: SIDE,
    borderRadius: SIDE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.card,
    boxShadow: ring(0.5, th.color.hairlineMenu),
    marginBottom: 1,
  },
  field: {
    flex: 1,
    minHeight: FIELD,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: FIELD / 2,
    backgroundColor: th.color.card,
    boxShadow: ring(0.5, th.color.hairlineMenu),
    paddingStart: th.space.gap14,
    paddingEnd: th.space.gap4,
  },
  inputWrap: { flex: 1 },
  input: {
    ...th.type.body,
    color: th.color.ink,
    paddingTop: INPUT_PAD_V,
    paddingBottom: INPUT_PAD_V,
    maxHeight: 120,
  },
  placeholder: {
    position: 'absolute',
    top: INPUT_PAD_V,
    start: CARET_CLEARANCE,
    end: 0,
  },
  sticker: {
    width: STICKER_BUTTON,
    height: STICKER_BUTTON,
    borderRadius: STICKER_BUTTON / 2,
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  mic: { width: SIDE, height: SIDE, alignItems: 'center', justifyContent: 'center' },
  send: {
    width: SIDE,
    height: SIDE,
    borderRadius: SIDE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.inkSurface,
  },
}));

export interface ComposerBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder: string;
  readonly canSend: boolean;
  readonly onSend: () => void;
  readonly trayOpen: boolean;
  readonly onToggleTray: () => void;
  readonly onFocus: () => void;
  /** Absent without device media (or while offline it still queues). */
  readonly onAdd?: () => void;
  readonly onMicTap?: () => void;
  readonly onMicHoldStart?: () => void;
  readonly onMicHoldEnd?: () => void;
  readonly recording: boolean;
  /** The reply or edit strip above the field. */
  readonly above?: ReactNode;
}

export const ComposerBar = forwardRef<ComponentRef<typeof TextInput>, ComposerBarProps>(
  function ComposerBar(props, ref) {
    const th = usePremiumTheme();
    const styles = useStyles();
    return (
      <View style={styles.bar} testID="chat-composer">
        {props.above}
        <View style={styles.row}>
          {props.onAdd === undefined ? null : (
            <PressableScale
              style={styles.plus}
              onPress={props.onAdd}
              hitSlop={SIDE_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'chat.premium.composer.add',
                message: 'Add a photo, poll or more',
              })}
              testID="chat-attach"
            >
              <Icon name="plus" size={18} color={th.color.ink} />
            </PressableScale>
          )}
          <View style={styles.field}>
            <View style={styles.inputWrap}>
              {props.value === '' ? (
                <View
                  style={styles.placeholder}
                  pointerEvents="none"
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                >
                  <Text variant="body" color={th.color.placeholder} numberOfLines={1}>
                    {props.placeholder}
                  </Text>
                </View>
              ) : null}
              <TextInput
                ref={ref}
                style={styles.input}
                value={props.value}
                onChangeText={props.onChangeText}
                onFocus={props.onFocus}
                selectionColor={th.color.caret}
                multiline
                maxLength={BODY_MAX}
                accessibilityLabel={t({ id: 'chat.premium.composer.field', message: 'Message' })}
                accessibilityHint={props.placeholder}
                testID="chat-input"
              />
            </View>
            <PressableScale
              style={[
                styles.sticker,
                {
                  backgroundColor: th.color.status.maybe.bg,
                  ...(props.trayOpen ? { boxShadow: ring(2, th.color.ink) } : {}),
                },
              ]}
              onPress={props.onToggleTray}
              hitSlop={STICKER_SLOP}
              accessibilityRole="button"
              accessibilityState={{ expanded: props.trayOpen }}
              accessibilityLabel={
                props.trayOpen
                  ? t({ id: 'chat.premium.composer.keyboard', message: 'Back to the keyboard' })
                  : t({ id: 'chat.premium.composer.stickers', message: 'Stickers' })
              }
              testID="chat-sticker-button"
            >
              <CritterSticker kind="gecko" name="Tokek" size={STICKER_BUTTON} edge={false} />
            </PressableScale>
          </View>
          {props.canSend ? (
            <PressableScale
              style={styles.send}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                props.onSend();
              }}
              hitSlop={SIDE_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t({ id: 'chat.premium.composer.send', message: 'Send' })}
              testID="chat-send"
            >
              <Icon name="send" size={18} color={th.color.onInkSurface} />
            </PressableScale>
          ) : props.onMicTap === undefined ? null : (
            <Pressable
              style={({ pressed }) => [
                styles.mic,
                pressed ? { transform: [{ scale: th.motion.pressScale }] } : null,
                props.recording ? { opacity: 0.6 } : null,
              ]}
              hitSlop={SIDE_SLOP}
              onPress={props.onMicTap}
              onLongPress={
                props.onMicHoldStart === undefined
                  ? undefined
                  : () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      props.onMicHoldStart?.();
                    }
              }
              onPressOut={props.recording ? props.onMicHoldEnd : undefined}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'chat.premium.composer.mic',
                message: 'Voice note: hold to talk',
              })}
              testID="chat-mic"
            >
              <Icon name="mic" size={18} color={th.color.ink} />
            </Pressable>
          )}
        </View>
      </View>
    );
  },
);

/** The strip above the field while replying or editing, with its ✕. */
export function ComposerStrip({
  title,
  line,
  onCancel,
}: {
  readonly title: string;
  readonly line: string;
  readonly onCancel: () => void;
}) {
  const th = usePremiumTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: th.space.gap8,
        paddingHorizontal: th.space.gap12,
        paddingVertical: th.space.gap6,
        borderLeftWidth: 3,
        borderLeftColor: th.accent.sun,
        marginStart: SIDE + th.space.gap8,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="helper">{title}</Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={1}>
          {line}
        </Text>
      </View>
      <PressableScale
        onPress={onCancel}
        hitSlop={STRIP_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'chat.premium.composer.cancelStrip', message: 'Cancel' })}
        testID="chat-strip-cancel"
      >
        <Icon name="close" size={16} color={th.color.muted} />
      </PressableScale>
    </View>
  );
}
