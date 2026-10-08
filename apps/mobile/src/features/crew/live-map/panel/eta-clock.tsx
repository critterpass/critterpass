/**
 * An arrival clock ("16:52") whose digits roll like an odometer each time the ETA is recounted.
 * Reduced motion swaps digits in place. "–" when there is no ETA; "~" marks a straight-line
 * estimate.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotionMode } from '@/motion/motion-mode';
import { Row, Text, useTheme } from '@/ui';

const ROLL_MS = 650;
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function RollingDigit({
  digit,
  height,
  animate,
}: {
  digit: number;
  height: number;
  animate: boolean;
}) {
  const position = useSharedValue(digit);
  useEffect(() => {
    position.value = animate ? withTiming(digit, { duration: ROLL_MS }) : digit;
  }, [digit, animate, position]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -position.value * height }] }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <View key={d} style={{ height, justifyContent: 'center' }}>
            <Text variant="title" tabular>
              {d}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export function EtaClock({
  value,
  estimate,
  label,
  testID,
}: {
  /** "16:52", or null for no ETA. */
  readonly value: string | null;
  readonly estimate: boolean;
  readonly label: string;
  readonly testID?: string;
}) {
  const theme = useTheme();
  const [motionMode] = useMotionMode();
  const [height, setHeight] = useState(0);
  if (value === null) {
    return (
      <Text
        variant="title"
        color={theme.semantic.text.secondary}
        accessibilityLabel={label}
        testID={testID}
      >
        –
      </Text>
    );
  }
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label} testID={testID}>
      {height === 0 ? (
        <Text variant="title" onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
          {estimate ? `~${value}` : value}
        </Text>
      ) : (
        <Row importantForAccessibility="no-hide-descendants">
          {estimate ? <Text variant="title">~</Text> : null}
          {value.split('').map((char, index) =>
            /[0-9]/.test(char) ? (
              <RollingDigit
                key={index}
                digit={Number(char)}
                height={height}
                animate={motionMode === 'full'}
              />
            ) : (
              <Text key={index} variant="title">
                {char}
              </Text>
            ),
          )}
        </Row>
      )}
    </View>
  );
}
