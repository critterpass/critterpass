import { forwardRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { ring } from '../theme/theme';

export interface TextFieldProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'selectionColor'
> {
  /** What the field holds, for assistive tech when there is no visible label. */
  readonly accessibilityLabel: string;
  /** Turns the ring pink and shows this line under the field. */
  readonly error?: string | undefined;
  /** A quiet line under the field when there is no error. */
  readonly helper?: string | undefined;
}

/**
 * The 52-high field: white with a 1.5 inset grey line by default, a 2 pt ink ring while focused, a
 * 2 pt pink ring with the error line under it; the caret is blue. The field grows with Dynamic Type
 * rather than clipping.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { error, helper, accessibilityLabel, onFocus, onBlur, editable, ...input },
  ref,
) {
  const t = usePremiumTheme();
  const [focused, setFocused] = useState(false);
  const field = t.type.field;
  const outline =
    error !== undefined
      ? ring(t.size.focusRing, t.color.destructive.fieldRing)
      : focused
        ? ring(t.size.focusRing, t.color.ink)
        : ring(t.size.fieldBorder, t.color.fieldBorder, true);
  const note = error ?? helper;

  return (
    <View style={{ gap: t.space.helperOffset }}>
      <View
        style={{
          minHeight: t.size.field,
          borderRadius: t.radius.field,
          backgroundColor: t.color.card,
          boxShadow: outline,
          paddingHorizontal: t.space.fieldPadH,
          justifyContent: 'center',
          opacity: editable === false ? t.opacity.disabled : 1,
        }}
      >
        <TextInput
          ref={ref}
          {...input}
          editable={editable}
          accessibilityLabel={accessibilityLabel}
          {...(error === undefined ? {} : { accessibilityHint: error })}
          allowFontScaling
          maxFontSizeMultiplier={field.maxScale}
          placeholderTextColor={t.color.placeholder}
          selectionColor={t.color.caret}
          cursorColor={t.color.caret}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            fontSize: field.size,
            fontWeight: field.weight,
            color: t.color.ink,
            paddingVertical: t.space.rowPadV,
          }}
        />
      </View>
      {note === undefined ? null : (
        <Text
          variant={error === undefined ? 'captionMuted' : 'helper'}
          {...(error === undefined
            ? { tone: 'muted' as const }
            : { color: t.color.destructive.helper })}
          style={{ paddingStart: t.space.helperIndent }}
          accessibilityLiveRegion={error === undefined ? 'none' : 'polite'}
        >
          {note}
        </Text>
      )}
    </View>
  );
});
