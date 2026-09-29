import { Fragment, useEffect, useRef, useState } from 'react';
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
  /** Letters as well as digits (crew join codes); a single group is digits-only by default (OTP). */
  readonly alphanumeric?: boolean;
  readonly testID?: string;
}

const { duration } = tokens.motion;
/** Bold Geist capitals' advance per em, a little generous so a fitted group never runs to its edges. */
const CODE_ADVANCE_EM = 0.72;
/** Below this a gift-code group would be hard to read beside the others: the groups stack instead. */
const GROUP_MIN_FONT_PT = tokens.space['16'];

/**
 * The size at which `chars` characters fill a group box `boxWidth` wide (its padding and border
 * taken off), so a code shrinks to its box instead of being cut.
 */
export function groupFitSize(boxWidth: number, chars: number, inset: number): number {
  return Math.max(0, boxWidth - inset) / (Math.max(1, chars) * CODE_ADVANCE_EM);
}
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
  groupedRow: { alignSelf: 'stretch' },
  groupedCells: { flex: 1 },
  stackedCells: { flexDirection: 'column', alignItems: 'stretch' },
  box: {
    width: sizeToken(t.size.otpBox, 'width'),
    height: sizeToken(t.size.otpBox, 'height'),
    borderRadius: t.radius.md,
    borderWidth: t.ring.input.idle.widthPt,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A gift code's group shares the row with the others (4d-4): the three boxes split the width
  // evenly and grow taller with the text instead of overflowing the card.
  group: {
    flex: 1,
    minWidth: 0,
    minHeight: sizeToken(t.size.otpBox, 'height'),
    paddingHorizontal: t.space['8'],
    borderRadius: t.radius.md,
    borderWidth: t.ring.input.idle.widthPt,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: { width: t.space['8'], height: 2, backgroundColor: t.semantic.border.decorative },
  capture: { ...StyleSheet.absoluteFill, opacity: 0.02, color: 'transparent' },
}));

function Box({
  char,
  border,
  grouped = false,
  minSize,
}: {
  readonly char: string;
  readonly border: string;
  /** One box holding a whole gift-code group, sized from the row's width rather than per character. */
  readonly grouped?: boolean;
  /** Smallest size a grouped code may shrink to; it is chosen so the group always fits. */
  readonly minSize?: number | undefined;
}) {
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
    <View style={[grouped ? styles.group : styles.box, { borderColor: border }]}>
      <Animated.View style={style}>
        {grouped ? (
          <Text variant="inputOtp" numberOfLines={1} autoFit autoFitMinSize={minSize}>
            {char}
          </Text>
        ) : (
          <Text variant="inputOtp">{char}</Text>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * Segmented code entry (OTP, crew join, 4-4-4 gift codes): characters drop into boxes, one per
 * digit for a single group and one per group for a gift code (4d-4: PASS - 7K2Q - MAYA), a valid code
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
  alphanumeric,
  testID,
}: CodeBoxesProps) {
  const styles = useStyles();
  const theme = useTheme();
  const font = useInputFont('inputOtp');
  const reduced = useReducedImpactMotion();
  const length = groups.reduce((sum, size) => sum + size, 0);
  const numeric = alphanumeric === undefined ? groups.length === 1 : !alphanumeric;
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

  const grouped = groups.length > 1;
  // A gift code's groups share one row and shrink to fit it; when even that would drop below a
  // readable size (large text on a small phone) they stack, each group whole on its own line.
  const [rowWidth, setRowWidth] = useState(0);
  const widest = Math.max(...groups);
  const inset = 2 * (theme.space['8'] + theme.ring.input.idle.widthPt);
  const dashes = (groups.length - 1) * (theme.space['8'] + 2 * theme.space['8']);
  const sideBySide = groupFitSize((rowWidth - dashes) / groups.length, widest, inset);
  const stacked = grouped && rowWidth > 0 && sideBySide < GROUP_MIN_FONT_PT;
  const groupMin = stacked ? groupFitSize(rowWidth, widest, inset) : sideBySide;

  return (
    <Animated.View style={[styles.row, grouped ? styles.groupedRow : null, shakeStyle]}>
      <View
        style={[
          styles.row,
          grouped ? styles.groupedCells : null,
          stacked ? styles.stackedCells : null,
        ]}
        testID={testID ? `${testID}-cells` : undefined}
        onLayout={(event) => {
          if (grouped && !stacked) setRowWidth(event.nativeEvent.layout.width);
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {groups.map((size, groupIndex) => {
          const start = groups.slice(0, groupIndex).reduce((sum, n) => sum + n, 0);
          const end = start + size;
          return (
            <Fragment key={start}>
              {groupIndex > 0 && !stacked ? <View style={styles.dash} /> : null}
              {grouped ? (
                <Box
                  grouped
                  {...(rowWidth > 0 ? { minSize: groupMin } : {})}
                  char={value.slice(start, end)}
                  border={borderFor(
                    theme,
                    status,
                    value.length > start,
                    value.length >= start && value.length < end,
                  )}
                />
              ) : (
                Array.from({ length: size }, (_, i) => {
                  const index = start + i;
                  const char = value[index] ?? '';
                  return (
                    <Box
                      key={index}
                      char={char}
                      border={borderFor(theme, status, char !== '', index === value.length)}
                    />
                  );
                })
              )}
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
