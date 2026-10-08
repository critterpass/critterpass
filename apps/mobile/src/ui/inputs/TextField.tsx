import { t } from '@lingui/core/macro';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import type { Theme } from '../theme';
import { makeStyles, MIN_TOUCH_TARGET, sizeToken, useTheme } from '../theme';
import { useNumberPadDone } from './NumberPadDone';
import { useInputFont } from './use-input-font';

export type FieldStatus = 'idle' | 'valid' | 'error';

export interface TextFieldProps extends Omit<
  TextInputProps,
  'style' | 'value' | 'onChangeText' | 'allowFontScaling'
> {
  /** Visible label above the field; also its accessible name. */
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** @default 'idle' */
  readonly status?: FieldStatus;
  /** Shown under the field; read with the field when `status` is `error`. */
  readonly message?: string;
  /** Leading adornment (a doodle icon, a country code). */
  readonly leading?: ReactNode;
  /** The label stays the accessible name but is not drawn (search fields). */
  readonly labelHidden?: boolean;
  /** Shows a clear button while the field has text. @default true */
  readonly clearable?: boolean;
  /**
   * More than one makes the field multiline: it stops growing at this many lines and scrolls
   * inside. Unset on a `multiline` field: it grows.
   */
  readonly maxLines?: number;
  readonly testID?: string;
}

const LINE_EM = 1.35;

function ringColour(theme: Theme, status: FieldStatus, focused: boolean): string {
  if (status === 'error') return theme.semantic.state.urgent;
  if (status === 'valid') return theme.semantic.state.success;
  return focused ? theme.semantic.action.primary : theme.semantic.border.control;
}

const useStyles = makeStyles((t) => ({
  field: {
    minHeight: sizeToken(t.size.otpBox, 'height'),
    borderRadius: t.radius.md,
    borderWidth: t.ring.input.idle.widthPt,
    backgroundColor: t.semantic.bg.raised,
    paddingStart: t.space['14'],
    paddingEnd: t.space['4'],
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    color: t.semantic.text.primary,
    paddingVertical: t.space['10'],
  },
  clear: { alignItems: 'center', justifyContent: 'center' },
}));

/** Labelled text input with the input focus/valid/error rings, a clear button and a message. */
export function TextField({
  label,
  value,
  onChangeText,
  status = 'idle',
  message,
  leading,
  labelHidden = false,
  clearable = true,
  maxLines,
  testID,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const font = useInputFont('input');
  const [focused, setFocused] = useState(false);
  const numberPad = useNumberPadDone(inputProps);
  // The face's natural line is about 1.35 em; the input's own vertical padding sits around it.
  const capped =
    maxLines === undefined
      ? null
      : { maxHeight: maxLines * Number(font.fontSize) * LINE_EM + theme.space['10'] * 2 };
  const messageColour =
    status === 'error'
      ? theme.semantic.state.urgent
      : status === 'valid'
        ? theme.semantic.state.success
        : theme.semantic.text.secondary;
  return (
    <Stack gap="6">
      {labelHidden ? null : (
        <Text variant="eyebrow" accessibilityElementsHidden importantForAccessibility="no">
          {label}
        </Text>
      )}
      <Row gap="10" style={[styles.field, { borderColor: ringColour(theme, status, focused) }]}>
        {leading}
        <TextInput
          {...(maxLines !== undefined && maxLines > 1 ? { multiline: true } : {})}
          {...inputProps}
          {...(numberPad.inputAccessoryViewID === undefined
            ? {}
            : { inputAccessoryViewID: numberPad.inputAccessoryViewID })}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          allowFontScaling={false}
          placeholderTextColor={theme.color.ink[300]}
          selectionColor={theme.semantic.action.primary}
          accessibilityLabel={label}
          accessibilityHint={message}
          aria-invalid={status === 'error'}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, font, capped]}
        />
        {clearable && value.length > 0 ? (
          <PressScale
            onPress={() => onChangeText('')}
            widthClass="narrow"
            accessibilityLabel={t({ id: 'common.field.clear', message: 'Clear' })}
            style={styles.clear}
          >
            <Text variant="title" color={theme.semantic.text.secondary}>
              ✕
            </Text>
          </PressScale>
        ) : null}
      </Row>
      {numberPad.accessory}
      {message ? (
        <View accessibilityLiveRegion={status === 'error' ? 'polite' : 'none'}>
          <Text variant="bodySm" color={messageColour}>
            {message}
          </Text>
        </View>
      ) : null}
    </Stack>
  );
}
