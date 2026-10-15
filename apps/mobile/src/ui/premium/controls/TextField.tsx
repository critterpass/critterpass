import { forwardRef, useState, type ComponentRef, type ReactNode } from 'react';
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
  /** Something kept inside the field on the right, after the counter (the expense's category). */
  readonly trailing?: ReactNode;
}

/**
 * The 52-high field: white with a 1.5 inset grey line by default, the same line in ink while
 * focused, a 2 pt pink ring with the error line under it; the caret is blue. A label rides inside above the
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
      trailing,
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
    // Every ring is drawn inside the field, so focusing one never makes it wider than the fields
    // beside it. Focus keeps the resting line's weight and only inks it: a 2 pt black ring read as
    // a heavy frame beside the faint lines of the fields around it.
    const outline =
      error !== undefined
        ? ring(t.size.focusRing, t.color.destructive.fieldRing, true)
        : focused
          ? ring(t.size.fieldBorder, t.color.ink, true)
          : ring(t.size.fieldBorder, t.color.fieldBorder, true);
    const note = error ?? helper;
    const showLabel = label !== undefined && (filled || focused);
    // Once the label rides above the value it says what the field holds: a placeholder repeating it
    // goes (a different hint stays).
    const hint = placeholder ?? label;
    const shownHint = showLabel && (placeholder === undefined || placeholder === label) ? '' : hint;

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
                style={{ paddingTop: t.space.gap6 }}
              >
                {label}
              </Text>
            ) : null}
            <TextInput
              ref={ref}
              {...input}
              {...(shownHint === undefined ? {} : { placeholder: shownHint })}
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
                // Android's own side padding set the value 4 dp in from the label above it.
                paddingHorizontal: 0,
                // The label and value fit the 52 field: it doesn't grow as the label appears.
                paddingTop: showLabel ? 0 : t.space.rowPadV,
                paddingBottom: showLabel ? t.space.gap6 : t.space.rowPadV,
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
          {trailing ?? null}
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
