/**
 * An amount whose digits roll to their new value instead of jumping (balances, splits, the keypad,
 * settling up): each digit is a column of 0–9 that slides on the Smooth spring; symbols, separators
 * and spaces stay put. Columns are keyed from the right, so "Rp 450.000" growing to "Rp 1.450.000"
 * rolls the digits that exist and fades in the new leading one. Reduce Motion cross-fades instead.
 * A column is one text of ten lines, each one line box tall, laid out over a hidden resting digit,
 * and every digit is tabular, so the amount keeps its width as it rolls.
 */
import type { PremiumTypeName } from '@cp/design-tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  type PremiumTextTone,
} from '@/ui/premium';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const STRIP = DIGITS.join('\n');

export interface RollingAmountProps {
  /** The formatted amount, exactly as it reads ("US$186.40"). */
  readonly text: string;
  readonly variant: PremiumTypeName;
  readonly tone?: PremiumTextTone;
  readonly color?: string;
  readonly testID?: string;
}

/** How long a digit that joins the amount takes to fade in. */
const JOIN_FADE_MS = 180;

function DigitColumn(props: {
  readonly digit: number;
  /** A digit that joined the amount after it first showed fades in; the first digits show at once. */
  readonly joins: boolean;
  readonly height: number;
  readonly variant: PremiumTypeName;
  readonly tone: PremiumTextTone;
  readonly color: string | undefined;
}) {
  const reduced = usePremiumReducedMotion();
  const value: SharedValue<number> = useSharedValue(props.digit);
  const opacity = useSharedValue(props.joins ? 0 : 1);
  useEffect(() => {
    opacity.set(withTiming(1, { duration: JOIN_FADE_MS }));
  }, [opacity]);
  const shown = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  useEffect(() => {
    value.set(
      reduced ? withTiming(props.digit, REDUCED_FADE) : withSpring(props.digit, SPRINGS.smooth),
    );
  }, [props.digit, reduced, value]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -value.get() * props.height }],
  }));
  return (
    <Animated.View style={[{ height: props.height, overflow: 'hidden' }, shown]}>
      {/* The resting width of one digit sizes the column. */}
      <Text
        variant={props.variant}
        style={[styles.tabular, styles.strip, styles.hidden, { lineHeight: props.height }]}
        accessible={false}
      >
        0
      </Text>
      {/* Laid out outside the one-line column: measured inside it, Android cuts the text to the
          column's height and draws only the 0 line, so every other digit rolled into blank. */}
      <Animated.View style={[styles.reel, style]}>
        <Text
          variant={props.variant}
          tone={props.tone}
          {...(props.color === undefined ? {} : { color: props.color })}
          style={[styles.tabular, styles.strip, { lineHeight: props.height }]}
          accessible={false}
        >
          {STRIP}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

export function RollingAmount({ text, variant, tone = 'ink', color, testID }: RollingAmountProps) {
  // One line box measured from the face itself, so a column is exactly one digit tall.
  const [height, setHeight] = useState(0);
  const chars = [...text];
  // The amount the digits first showed. Only a digit added once it changed fades in, on its own
  // opacity: an `entering` layout animation on Android now and then stays at opacity 0, which left
  // a balance reading "−24 ," for "−241,666" and a spend reading "₫ ,000" for "₫63,000".
  const [first, setFirst] = useState<string | null>(null);
  const joins = first !== null && first !== text;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      style={styles.row}
      testID={testID}
    >
      <Text
        variant={variant}
        style={[styles.measure, styles.tabular]}
        onLayout={(event) => {
          setHeight(event.nativeEvent.layout.height);
          setFirst((current) => current ?? text);
        }}
      >
        0
      </Text>
      {chars.map((char, index) => {
        const key = chars.length - index;
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        if (digit === -1 || height === 0) {
          return (
            <Text
              // eslint-disable-next-line lingui/no-unlocalized-strings -- a React key, not copy
              key={`c${key}-${char}`}
              variant={variant}
              tone={tone}
              {...(color === undefined ? {} : { color })}
              style={styles.tabular}
            >
              {char}
            </Text>
          );
        }
        return (
          <DigitColumn
            key={`d${key}`}
            digit={digit}
            joins={joins}
            height={height}
            variant={variant}
            tone={tone}
            color={color}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  measure: { position: 'absolute', opacity: 0 },
  hidden: { opacity: 0 },
  reel: { position: 'absolute', top: 0, left: 0, right: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  // No font padding, so each of the ten lines is exactly one line box.
  strip: { includeFontPadding: false, textAlignVertical: 'top' },
});
