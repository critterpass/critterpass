import { forwardRef } from 'react';
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

/**
 * The message composer shell: white r28 h56 pill with a 40 control `+`, the field (15 pt) and a 44
 * ink send. It holds no message state: the screen owns the draft, so nothing typed is lost when a
 * send fails.
 */
export const Composer = forwardRef<TextInput, ComposerProps>(function Composer(
  { accessibilityLabel, onSend, canSend, sendLabel, add, ...input },
  ref,
) {
  const t = usePremiumTheme();
  const body = t.type.body;
  return (
    <View
      style={{
        minHeight: t.size.composer,
        borderRadius: t.radius.composer,
        backgroundColor: t.color.card,
        boxShadow: t.scheme === 'dark' ? t.shadow.raised : undefined,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.gap10,
        paddingStart: t.space.gap8,
        paddingEnd: t.space.gap6,
      }}
    >
      {add === undefined ? null : (
        <IconButton icon="plus" tone="control" label={add.label} onPress={add.onPress} />
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
          color: t.color.ink,
          paddingVertical: t.space.rowPadV,
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
