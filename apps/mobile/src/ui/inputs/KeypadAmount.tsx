import { useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { useOdometer } from '@/motion/patterns/odometer';
import { useLocale } from '@/lib/i18n/use-locale';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface KeypadAmountProps {
  /** Whole amount in the currency's display unit (the keypad's digit string as a number). */
  readonly value: number;
  /** Currency symbol or code before the number ("Rp", "$"). */
  readonly currency: string;
  /** The "≈ $28.42 · $4.74 each" line under the amount. */
  readonly approx?: string;
  /** Formatted amount for screen readers ("Rp 450,000"). */
  readonly label: string;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const useStyles = makeStyles((t) => ({
  clip: { overflow: 'hidden' },
  strip: { position: 'absolute', top: 0, start: 0 },
  currency: { marginBottom: t.space['8'] },
}));

function Column({
  value,
  height,
}: {
  readonly value: SharedValue<number>;
  readonly height: number;
}) {
  const styles = useStyles();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -(((value.value % 10) + 10) % 10) * height }],
  }));
  // Display faces draw numerals above their tight line box (the text's glyph-room margin). Each
  // cell gives that room back as padding so a digit sits whole inside its window, and the window
  // is lifted by the same amount so the digits line up with the currency beside them.
  const [room, setRoom] = useState(0);
  return (
    <View style={[styles.clip, { height, marginTop: -room }]}>
      <Text
        variant="displayHero"
        style={{ opacity: 0 }}
        onLayout={(event) => setRoom(Math.max(0, -event.nativeEvent.layout.y))}
      >
        0
      </Text>
      <Animated.View style={[styles.strip, style]}>
        {DIGITS.map((digit, index) => (
          <View key={index} style={{ height, paddingTop: room }}>
            <Text variant="displayHero">{digit}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function groupSeparator(locale: string): string {
  // Hermes on iOS has no `NumberFormat#formatToParts`; the separator is whatever 1000 formats with
  // besides its digits (",", ".", a narrow no-break space…).
  const separator = new Intl.NumberFormat(locale).format(1000).replace(/\d/g, '');
  return separator || ',';
}

/** The keypad's rolling amount (odometer digits, locale grouping) with the ≈ conversion line. */
export function KeypadAmount({ value, currency, approx, label }: KeypadAmountProps) {
  const styles = useStyles();
  const locale = useLocale();
  const { columns } = useOdometer(value);
  const [height, setHeight] = useState(0);
  const separator = groupSeparator(locale);
  const digitColumns = columns.filter((column) => !column.isSign);
  const onMeasure = (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height);
  return (
    <Stack
      gap="4"
      align="center"
      accessible
      accessibilityLabel={approx ? `${label}, ${approx}` : label}
      accessibilityLiveRegion="polite"
    >
      <Row gap="6" align="flex-end">
        <Text variant="h3" color={undefined} style={styles.currency}>
          {currency}
        </Text>
        {height === 0 ? (
          <Text variant="displayHero" onLayout={onMeasure}>
            0
          </Text>
        ) : (
          <Row>
            {digitColumns.map((column, index) => {
              const fromRight = digitColumns.length - index;
              const grouped = fromRight % 3 === 0 && index > 0;
              return (
                <Row key={column.key}>
                  {grouped ? <Text variant="displayHero">{separator}</Text> : null}
                  <Column value={column.value} height={height} />
                </Row>
              );
            })}
          </Row>
        )}
      </Row>
      {approx ? <SecondaryText>{approx}</SecondaryText> : null}
    </Stack>
  );
}
