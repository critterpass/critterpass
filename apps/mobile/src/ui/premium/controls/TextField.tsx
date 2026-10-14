import { forwardRef, useState, type ComponentRef } from 'react';
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
  /**
   * What the field holds, drawn small inside it above the value once there is one (2.06 "Name"),
   * so a filled field still says what it is; empty, it stands as the placeholder.
   */
  readonly label?: string | undefined;
  /** A count kept inside the field on the right ("10/32", 3.08). */
  readonly counter?: string | undefined;
}

/**
 * The 52-high field: white with a 1.5 inset grey line by default, a 2 pt ink ring while focused, a
 * 2 pt pink ring with the error line under it; the caret is blue. A label rides inside above the
 * value once it has one, a counter sits inside on the right. The field grows with Dynamic Type
 * rather than clipping.
 */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(
  function TextField(
    {
      error,
      helper,
      label,
      counter,
      accessibilityLabel,
      onFocus,
      onBlur,
      onChangeText,
      editable,
      placeholder,
      ...input
    },
    ref,
  ) {
    const t = usePremiumTheme();
    const [focused, setFocused] = useState(false);
    // Placeholder words are regular, typed words medium (U5): an uncontrolled field tracks its own.
    const [typed, setTyped] = useState((input.defaultValue ?? '') !== '');
    const filled = input.value === undefined ? typed : input.value !== '';
    const field = t.type.field;
    const outline =
      error !== undefined
        ? ring(t.size.focusRing, t.color.destructive.fieldRing)
        : focused
          ? ring(t.size.focusRing, t.color.ink)
          : ring(t.size.fieldBorder, t.color.fieldBorder, true);
    const note = error ?? helper;
    const showLabel = label !== undefined && (filled || focused);

    return (
      <View style={{ gap: t.space.helperOffset }}>
        <View
          style={{
            minHeight: t.size.field,
            borderRadius: t.radius.field,
            backgroundColor: t.color.card,
            boxShadow: outline,
            paddingHorizontal: t.space.fieldPadH,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space.gap8,
            opacity: editable === false ? t.opacity.disabled : 1,
          }}
        >
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {showLabel ? (
              <Text
                variant="helper"
                {...(error === undefined
                  ? { tone: 'muted' as const }
                  : { color: t.color.destructive.helper })}
                numberOfLines={1}
                style={{ paddingTop: t.space.gap8 }}
              >
                {label}
              </Text>
            ) : null}
            <TextInput
              ref={ref}
              {...input}
              {...((placeholder ?? label) === undefined
                ? {}
                : { placeholder: placeholder ?? label })}
              editable={editable}
              accessibilityLabel={accessibilityLabel}
              {...(error === undefined ? {} : { accessibilityHint: error })}
              allowFontScaling
              maxFontSizeMultiplier={field.maxScale}
              placeholderTextColor={t.color.placeholder}
              selectionColor={t.color.caret}
              cursorColor={t.color.caret}
              onChangeText={(text) => {
                setTyped(text !== '');
                onChangeText?.(text);
              }}
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
                fontWeight: filled ? field.weight : '400',
                color: t.color.ink,
                paddingTop: showLabel ? 0 : t.space.rowPadV,
                paddingBottom: showLabel ? t.space.gap8 : t.space.rowPadV,
              }}
            />
          </View>
          {counter === undefined ? null : (
            <Text
              variant="caption"
              color={error === undefined ? t.color.muted : t.color.destructive.helper}
              style={{ fontVariant: ['tabular-nums'] }}
              accessibilityLabel={counter}
            >
              {counter}
            </Text>
          )}
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
  },
);
