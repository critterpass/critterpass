/**
 * An amount whose digits roll to their new value instead of jumping (balances, splits, the keypad,
 * settling up): each digit is a column of 0–9 that slides on the Smooth spring; symbols, separators
 * and spaces stay put. Columns are keyed from the right, so "Rp 450.000" growing to "Rp 1.450.000"
 * rolls the digits that exist and fades in the new leading one. Reduce Motion cross-fades instead.
 */
import type { PremiumTypeName } from '@cp/design-tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
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

export interface RollingAmountProps {
  /** The formatted amount, exactly as it reads ("US$186.40"). */
  readonly text: string;
  readonly variant: PremiumTypeName;
  readonly tone?: PremiumTextTone;
  readonly color?: string;
  readonly testID?: string;
}

function DigitColumn(props: {
  readonly digit: number;
  readonly height: number;
  readonly variant: PremiumTypeName;
  readonly tone: PremiumTextTone;
  readonly color: string | undefined;
}) {
  const reduced = usePremiumReducedMotion();
  const value: SharedValue<number> = useSharedValue(props.digit);
  useEffect(() => {
    value.set(
      reduced ? withTiming(props.digit, REDUCED_FADE) : withSpring(props.digit, SPRINGS.smooth),
    );
  }, [props.digit, reduced, value]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -value.get() * props.height }],
  }));
  return (
    <View style={{ height: props.height, overflow: 'hidden' }}>
      <Animated.View style={style}>
        {DIGITS.map((digit) => (
          <View key={digit} style={{ height: props.height, justifyContent: 'center' }}>
            <Text
              variant={props.variant}
              tone={props.tone}
              {...(props.color === undefined ? {} : { color: props.color })}
            >
              {digit}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export function RollingAmount({ text, variant, tone = 'ink', color, testID }: RollingAmountProps) {
  // One line box measured from the face itself, so a column is exactly one digit tall.
  const [height, setHeight] = useState(0);
  const chars = [...text];
  // The amount the digits first showed. Only a digit added once it changed fades in: the first
  // digits mount as one batch of layout animations, and on Android a batch now and then stays at
  // opacity 0, which left a balance reading "−24 ," for "−241,666".
  const [first, setFirst] = useState<string | null>(null);
  const fade = first !== null && first !== text ? { entering: FadeIn } : {};
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
        style={styles.measure}
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
            >
              {char}
            </Text>
          );
        }
        return (
          <Animated.View key={`d${key}`} {...fade}>
            <DigitColumn
              digit={digit}
              height={height}
              variant={variant}
              tone={tone}
              color={color}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  measure: { position: 'absolute', opacity: 0 },
});
