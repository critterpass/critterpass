import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { usePremiumReducedMotion } from './reduced-motion';
import { SPRINGS } from './springs';
import type { PremiumTypeName } from '../theme/kit-type';

/** The rolling strip, 0 to 9, one per line: one text node per column, not ten. */
const STRIP = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9';

/** Every digit takes the same width, so a rolling amount never shifts sideways. */
const TABULAR = { fontVariant: ['tabular-nums' as const] };

/** One character slot, keyed from the right so the ones place keeps its column as numbers grow. */
export interface RollSlot {
  readonly key: string;
  /** 0–9 for a digit, `null` for a separator, sign or currency mark (drawn still). */
  readonly digit: number | null;
  readonly char: string;
}

/** Splits formatted text ("$1,092.10") into slots; digits roll, everything else stays put. */
export function rollSlots(text: string): readonly RollSlot[] {
  const chars = Array.from(text);
  return chars.map((char, i) => {
    const fromRight = chars.length - 1 - i;
    const digit = /^[0-9]$/.test(char) ? Number(char) : null;
    return { key: `${digit === null ? 'c' : 'd'}${String(fromRight)}`, digit, char };
  });
}

function DigitColumn({
  digit,
  lineHeight,
  variant,
  color,
}: {
  readonly digit: number;
  readonly lineHeight: number;
  readonly variant: PremiumTypeName;
  readonly color: string | undefined;
}) {
  const reduced = usePremiumReducedMotion();
  // A new column (99 → 100) rolls in from 0 rather than snapping in.
  const position = useSharedValue(0);
  useEffect(() => {
    position.set(reduced ? digit : withSpring(digit, SPRINGS.smooth));
  }, [digit, reduced, position]);
  const strip = useAnimatedStyle(() => ({
    transform: [{ translateY: -position.value * lineHeight }],
  }));
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      {/* The resting digit sizes the column; the strip rolls over it. */}
      <Text variant={variant} style={[TABULAR, { lineHeight, opacity: 0 }]}>
        {String(digit)}
      </Text>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, strip]}>
        <Text
          variant={variant}
          align="center"
          singleLine={false}
          style={[TABULAR, { lineHeight }]}
          {...(color === undefined ? {} : { color })}
        >
          {STRIP}
        </Text>
      </Animated.View>
    </View>
  );
}

export interface NumberRollProps {
  /** The number as the screen shows it, already formatted for the locale and currency. */
  readonly text: string;
  /** @default 'stat' */
  readonly variant?: PremiumTypeName;
  readonly color?: string;
  readonly testID?: string;
}

/**
 * A number that rolls to its new value, digit by digit, on the Smooth spring, so an amount never
 * jumps; separators and symbols stay still. Under Reduce Motion it changes in place. Assistive tech
 * reads the whole formatted text once.
 */
export function NumberRoll({ text, variant = 'stat', color, testID }: NumberRollProps) {
  const t = usePremiumTheme();
  const token = t.type[variant];
  const lineHeight = token.lineHeight ?? Math.ceil(token.size * t.motion.rollLineHeight);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      style={{ flexDirection: 'row' }}
    >
      {rollSlots(text).map((slot) =>
        slot.digit === null ? (
          <Text
            key={slot.key}
            variant={variant}
            style={[TABULAR, { lineHeight }]}
            {...(color === undefined ? {} : { color })}
          >
            {slot.char}
          </Text>
        ) : (
          <DigitColumn
            key={slot.key}
            digit={slot.digit}
            lineHeight={lineHeight}
            variant={variant}
            color={color}
          />
        ),
      )}
    </View>
  );
}
