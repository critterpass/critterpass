import { useState } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { format } from '@cp/i18n';

import { useOdometer } from '@/motion/patterns/odometer';
import { useLocale } from '@/lib/i18n/use-locale';

import { Row } from '../layout/Row';
import type { TextVariant } from '../text/Text';
import { Text } from '../text/Text';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

function DigitColumn({
  value,
  height,
  variant,
  color,
}: {
  readonly value: SharedValue<number>;
  readonly height: number;
  readonly variant: TextVariant;
  readonly color: string | undefined;
}) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -value.value * height }] }));
  // Display faces draw numerals above their tight line box (the text's glyph-room margin). Each
  // cell gives that room back as padding so a digit sits whole inside its window, and the window
  // is lifted by the same amount so the digits line up with the static text beside them.
  const [room, setRoom] = useState(0);
  return (
    <View style={{ height, overflow: 'hidden', marginTop: -room }}>
      <Text
        variant={variant}
        style={{ position: 'absolute', opacity: 0 }}
        onLayout={(event) => setRoom(Math.max(0, -event.nativeEvent.layout.y))}
      >
        0
      </Text>
      <Animated.View style={style}>
        {DIGITS.map((digit) => (
          <View key={digit} style={{ height, paddingTop: room }}>
            <Text variant={variant} color={color}>
              {digit}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export interface OdometerProps {
  /** Whole number to show; each digit rolls to its new value. */
  readonly value: number;
  /** Currency symbol or unit before the number ("$", "Rp"). */
  readonly prefix?: string;
  readonly suffix?: string;
  /** @default 'displayHero' */
  readonly variant?: TextVariant;
  readonly color?: string;
  /** Spoken context before the amount ("You're owed"). */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * Rolling-digit number (money totals, prices) with locale grouping. Reads as one text element:
 * the formatted amount, never the individual digit strips.
 */
export function Odometer({
  value,
  prefix = '',
  suffix = '',
  variant = 'displayHero',
  color,
  accessibilityLabel,
  testID,
}: OdometerProps) {
  const locale = useLocale();
  const { columns } = useOdometer(value);
  const [lineHeight, setLineHeight] = useState(0);
  const whole = Math.trunc(value);
  const grouped = format.number(locale, Math.abs(whole), { maximumFractionDigits: 0 });
  const sign = whole < 0 ? '−' : '';
  const text = `${sign}${prefix}${grouped}${suffix}`;
  const digitColumns = columns.filter((column) => !column.isSign);
  let digitIndex = 0;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={[accessibilityLabel, text].filter(Boolean).join(', ')}
    >
      {lineHeight === 0 ? (
        // An amount is one line: the digit row never wraps, so a measured second line here means
        // the row will run past its box. Reported, so a screen that sets it too large is caught.
        <Text
          variant={variant}
          color={color}
          singleLine
          onLayout={(event) => setLineHeight(event.nativeEvent.layout.height)}
        >
          {text}
        </Text>
      ) : (
        <Row importantForAccessibility="no-hide-descendants">
          <Text variant={variant} color={color}>
            {`${sign}${prefix}`}
          </Text>
          {grouped.split('').map((char, index) => {
            const column = /[0-9]/.test(char) ? digitColumns[digitIndex++] : undefined;
            return column ? (
              <DigitColumn
                key={column.key}
                value={column.value}
                height={lineHeight}
                variant={variant}
                color={color}
              />
            ) : (
              <Text key={`s${index}`} variant={variant} color={color}>
                {char}
              </Text>
            );
          })}
          {suffix ? (
            <Text variant={variant} color={color}>
              {suffix}
            </Text>
          ) : null}
        </Row>
      )}
    </View>
  );
}
