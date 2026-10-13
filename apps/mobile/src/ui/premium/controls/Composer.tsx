import { forwardRef, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { IconButton } from '../buttons/IconButton';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

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
}

/** Lines the field grows to before it scrolls inside: a pasted essay never outgrows the screen. */
const MAX_LINES = 5;

/**
 * The message composer shell: white r28 h56 pill with a 40 control `+`, the field (15 pt) and a 44
 * ink send. The field grows to five lines, then scrolls; `+` and send stay on its last line. It
 * holds no message state: the screen owns the draft, so nothing typed is lost when a send fails.
 */
export const Composer = forwardRef<ComponentRef<typeof TextInput>, ComposerProps>(function Composer(
  { accessibilityLabel, onSend, canSend, sendLabel, add, ...input },
  ref,
) {
  const t = usePremiumTheme();
  const body = t.type.body;
  const lineHeight = Math.ceil(body.size * 1.35);
  // The pill's own inset around the 44 send keeps it 56 tall on one line.
  const inset = (t.size.composer - t.size.composerSend) / 2;
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
      <TextInput
        ref={ref}
        {...input}
        multiline
        accessibilityLabel={accessibilityLabel}
        allowFontScaling
        maxFontSizeMultiplier={body.maxScale}
        placeholderTextColor={t.color.placeholder}
        selectionColor={t.color.caret}
        cursorColor={t.color.caret}
        style={{
          flex: 1,
          fontSize: body.size,
          lineHeight,
          color: t.color.ink,
          // One line sits centred on the send; more lines grow upwards from it.
          minHeight: t.size.composerSend,
          maxHeight: lineHeight * MAX_LINES + 2 * t.space.rowPadV,
          paddingVertical: (t.size.composerSend - lineHeight) / 2,
          textAlignVertical: 'center',
          ...(add === undefined ? { paddingStart: t.space.gap8 } : {}),
        }}
      />
      <IconButton
        icon="send"
        tone="ink"
        size={t.size.composerSend}
        label={sendLabel}
        disabled={!canSend}
        onPress={onSend}
      />
    </View>
  );
});
