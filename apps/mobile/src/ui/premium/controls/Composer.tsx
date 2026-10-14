import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { IconButton } from '../buttons/IconButton';
import type { PremiumIconName } from '../icons/Icon';
import { CrossFade } from '../motion/CrossFade';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

/** The action in send's place while the field is empty (the guide's mic). */
export interface ComposerIdleAction {
  readonly icon: PremiumIconName;
  readonly label: string;
  readonly onPress: () => void;
  /** A hold does something else (the mic: tap opens voice, hold talks at once). */
  readonly onLongPress?: () => void;
  readonly testID?: string;
}

export interface ComposerProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'selectionColor' | 'multiline'
> {
  readonly accessibilityLabel: string;
  readonly onSend: () => void;
  /** Send is off until there is something to send (and while a send is in flight). */
  readonly canSend: boolean;
  readonly sendLabel: string;
  /** The `+` that opens attachments, with what it adds ("Add a photo"); hidden without it. */
  readonly add?: { readonly onPress: () => void; readonly label: string };
  /**
   * Drawn in send's place while the field is empty; send replaces it, with a cross-fade, once
   * there is text. Without it send shows, off, on an empty field.
   */
  readonly idle?: ComposerIdleAction;
}

/**
 * The field's text starts at its edge, where the caret stands, so a placeholder the field drew
 * itself sat under the caret: the composer draws it this far in instead.
 */
const CARET_CLEARANCE = 3;

/** Lines the field grows to before it scrolls inside: a pasted essay never outgrows the screen. */
const MAX_LINES = 5;

/**
 * The message composer shell: white r28 h56 pill with a 40 control `+`, the field (15 pt) and a 44
 * ink send. The field grows to five lines, then scrolls; `+` and send stay on its last line. It
 * holds no message state: the screen owns the draft, so nothing typed is lost when a send fails.
 */
export const Composer = forwardRef<ComponentRef<typeof TextInput>, ComposerProps>(function Composer(
  { accessibilityLabel, onSend, canSend, sendLabel, add, idle, placeholder, ...input },
  ref,
) {
  const t = usePremiumTheme();
  const body = t.type.body;
  const lineHeight = Math.ceil(body.size * 1.35);
  // The pill's own inset around the 44 send keeps it 56 tall on one line.
  const inset = (t.size.composer - t.size.composerSend) / 2;
  const fieldPadV = (t.size.composerSend - lineHeight) / 2;
  const fieldPadStart = add === undefined ? t.space.gap8 : 0;
  // Uncontrolled, the field's emptiness is unknown: it keeps its own placeholder then.
  const controlled = input.value !== undefined;
  const empty = (input.value ?? '') === '';
  const showIdle = idle !== undefined && controlled && empty;
  const send = showIdle ? (
    <IconButton
      icon={idle.icon}
      tone="ink"
      size={t.size.composerSend}
      label={idle.label}
      onPress={idle.onPress}
      {...(idle.onLongPress === undefined ? {} : { onLongPress: idle.onLongPress })}
      {...(idle.testID === undefined ? {} : { testID: idle.testID })}
    />
  ) : (
    <IconButton
      icon="send"
      tone="ink"
      size={t.size.composerSend}
      label={sendLabel}
      disabled={!canSend}
      onPress={onSend}
    />
  );
  return (
    <View
      style={{
        minHeight: t.size.composer,
        borderRadius: t.radius.composer,
        backgroundColor: t.color.card,
        boxShadow: t.scheme === 'dark' ? t.shadow.raised : undefined,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: t.space.gap10,
        paddingStart: t.space.gap8,
        paddingEnd: t.space.gap6,
        paddingVertical: inset,
      }}
    >
      {add === undefined ? null : (
        <View style={{ marginBottom: (t.size.composerSend - t.size.composerPlus) / 2 }}>
          <IconButton
            icon="plus"
            tone="control"
            size={t.size.composerPlus}
            label={add.label}
            onPress={add.onPress}
          />
        </View>
      )}
      <View style={styles.field}>
        <TextInput
          ref={ref}
          {...input}
          {...(controlled || placeholder === undefined ? {} : { placeholder })}
          {...(controlled && placeholder !== undefined && input.accessibilityHint === undefined
            ? { accessibilityHint: placeholder }
            : {})}
          multiline
          accessibilityLabel={accessibilityLabel}
          allowFontScaling
          maxFontSizeMultiplier={body.maxScale}
          placeholderTextColor={t.color.placeholder}
          selectionColor={t.color.caret}
          cursorColor={t.color.caret}
          style={{
            fontSize: body.size,
            lineHeight,
            color: t.color.ink,
            // One line sits centred on the send; more lines grow upwards from it.
            minHeight: t.size.composerSend,
            maxHeight: lineHeight * MAX_LINES + 2 * t.space.rowPadV,
            paddingVertical: fieldPadV,
            textAlignVertical: 'center',
            paddingStart: fieldPadStart,
          }}
        />
        {controlled && empty && placeholder !== undefined ? (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.placeholder, { top: fieldPadV, start: fieldPadStart + CARET_CLEARANCE }]}
          >
            <Text
              variant="body"
              tone="placeholder"
              numberOfLines={1}
              style={{ lineHeight }}
              maxFontSizeMultiplier={body.maxScale}
            >
              {placeholder}
            </Text>
          </View>
        ) : null}
      </View>
      {idle === undefined ? (
        send
      ) : (
        <View style={{ width: t.size.composerSend, height: t.size.composerSend }}>
          <CrossFade swapKey={showIdle ? 'idle' : 'send'} style={StyleSheet.absoluteFill}>
            {send}
          </CrossFade>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { flex: 1 },
  placeholder: { position: 'absolute', end: 0 },
});
