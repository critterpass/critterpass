import { Fragment, useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { impact } from '@/motion/feedback';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Text } from '../text/Text';
import type { Theme } from '../theme';
import { makeStyles, sizeToken, useTheme } from '../theme';
import { useInputFont } from './use-input-font';

export type CodeStatus = 'idle' | 'valid' | 'invalid';

export interface CodeBoxesProps {
  readonly value: string;
  readonly onChangeText: (code: string) => void;
  /** Fires once every box is filled. */
  readonly onComplete?: (code: string) => void;
  /** Box groups: `[6]` for OTP and crew join codes, `[4, 4, 4]` for gift codes. @default [6] */
  readonly groups?: readonly number[];
  /** @default 'idle' */
  readonly status?: CodeStatus;
  /** Accessible name ("Verification code", "Gift code"). */
  readonly label: string;
  readonly autoFocus?: boolean;
  readonly testID?: string;
}

const { duration } = tokens.motion;
const DROP_PT = 10;
const SHAKE_PT = 8;

function borderFor(theme: Theme, status: CodeStatus, filled: boolean, active: boolean): string {
  if (status === 'invalid') return theme.semantic.state.urgent;
  if (status === 'valid') return theme.semantic.state.success;
  if (active) return theme.semantic.action.primary;
  return filled ? theme.semantic.text.secondary : theme.semantic.border.control;
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space['8'] },
  box: {
    width: sizeToken(t.size.otpBox, 'width'),
    height: sizeToken(t.size.otpBox, 'height'),
    borderRadius: t.radius.md,
    borderWidth: t.ring.input.idle.widthPt,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: { width: t.space['8'], height: 2, backgroundColor: t.semantic.border.decorative },
  capture: { ...StyleSheet.absoluteFill, opacity: 0.02, color: 'transparent' },
}));

function Box({ char, border }: { readonly char: string; readonly border: string }) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const drop = useSharedValue(0);
  useEffect(() => {
    if (!char || reduced) return;
    drop.value = -DROP_PT;
    drop.value = withTiming(0, { duration: duration.fast });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [char, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: drop.value }] }));
  return (
    <View style={[styles.box, { borderColor: border }]}>
      <Animated.View style={style}>
        <Text variant="inputOtp">{char}</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Segmented code entry (OTP, crew join, 4-4-4 gift codes): digits drop into boxes, a valid code
 * rings green, an invalid one shakes and plays the error cue. One hidden native input receives the
 * text (and the OS one-time-code autofill); screen readers see only that input.
 */
export function CodeBoxes({
  value,
  onChangeText,
  onComplete,
  groups = [6],
  status = 'idle',
  label,
  autoFocus,
  testID,
}: CodeBoxesProps) {
  const styles = useStyles();
  const theme = useTheme();
  const font = useInputFont('inputOtp');
  const reduced = useReducedImpactMotion();
  const length = groups.reduce((sum, size) => sum + size, 0);
  const numeric = groups.length === 1;
  const shake = useSharedValue(0);
  const previousStatus = useRef(status);

  useEffect(() => {
    if (status === previousStatus.current) return;
    previousStatus.current = status;
    if (status === 'invalid') {
      impact('error');
      if (!reduced) {
        const step = { duration: duration.instant / 3 };
        shake.value = withSequence(
          withTiming(-SHAKE_PT, step),
          withTiming(SHAKE_PT, step),
          withTiming(-SHAKE_PT / 2, step),
          withTiming(0, step),
        );
      }
    } else if (status === 'valid') {
      impact('success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [status, reduced]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const onText = (text: string) => {
    const cleaned = (numeric ? text.replace(/\D/g, '') : text.replace(/[^0-9a-z]/gi, ''))
      .toUpperCase()
      .slice(0, length);
    onChangeText(cleaned);
    if (cleaned.length === length) onComplete?.(cleaned);
  };

  return (
    <Animated.View style={[styles.row, shakeStyle]}>
      <View
        style={styles.row}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {groups.map((size, groupIndex) => {
          const start = groups.slice(0, groupIndex).reduce((sum, n) => sum + n, 0);
          return (
            <Fragment key={start}>
              {groupIndex > 0 ? <View style={styles.dash} /> : null}
              {Array.from({ length: size }, (_, i) => {
                const index = start + i;
                const char = value[index] ?? '';
                return (
                  <Box
                    key={index}
                    char={char}
                    border={borderFor(theme, status, char !== '', index === value.length)}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </View>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onText}
        maxLength={length}
        keyboardType={numeric ? 'number-pad' : 'default'}
        autoCapitalize="characters"
        autoCorrect={false}
        textContentType={numeric ? 'oneTimeCode' : 'none'}
        autoComplete={numeric ? 'one-time-code' : 'off'}
        allowFontScaling={false}
        caretHidden
        accessibilityLabel={label}
        aria-invalid={status === 'invalid'}
        {...(autoFocus !== undefined ? { autoFocus } : {})}
        style={[styles.capture, font]}
      />
    </Animated.View>
  );
}
