/**
 * The six code tiles (2.15, 2.16; reused for any six-character code): one hidden field behind six
 * white tiles, an ink ring on filled tiles and on the caret's tile, a pink ring and a Snappy shake
 * when the code is wrong. Characters are SF 30/800, upper-case, from the real code alphabet.
 */
import { useEffect, useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ring, SPRINGS, Text, usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';

import { SHAKE_LEG_MS } from './onboarding-colours';

export interface CodeTilesProps {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly length?: number;
  readonly error?: boolean;
  readonly autoFocus?: boolean;
  readonly accessibilityLabel: string;
  readonly onSubmit?: () => void;
  readonly testID?: string;
}

export function CodeTiles({
  value,
  onChangeText,
  length = 6,
  error = false,
  autoFocus = false,
  accessibilityLabel,
  onSubmit,
  testID,
}: CodeTilesProps) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const input = useRef<TextInput>(null);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!error || reduced) return;
    shake.value = withSequence(
      withTiming(6, { duration: SHAKE_LEG_MS }),
      withTiming(-6, { duration: SHAKE_LEG_MS }),
      withTiming(6, { duration: SHAKE_LEG_MS }),
      withTiming(-6, { duration: SHAKE_LEG_MS }),
      withSpring(0, SPRINGS.snappy),
    );
  }, [error, reduced, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const chars = value.padEnd(length, ' ').slice(0, length).split('');
  return (
    <Pressable
      onPress={() => input.current?.focus()}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Animated.View style={[{ flexDirection: 'row', gap: theme.space.gap8 }, shakeStyle]}>
        {chars.map((char, i) => {
          const filled = char !== ' ';
          const caret = i === value.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 64,
                borderRadius: theme.radius.segmentInner,
                backgroundColor: theme.color.card,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: error
                  ? ring(theme.size.focusRing, theme.color.destructive.fieldRing, true)
                  : filled || caret
                    ? ring(theme.size.focusRing, theme.color.ink, true)
                    : ring(theme.size.fieldBorder, theme.color.fieldBorder, true),
              }}
            >
              <Text variant="stat">{filled ? char : ''}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^0-9a-z]/giu, '').slice(0, length))}
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType="ascii-capable"
        returnKeyType="join"
        onSubmitEditing={onSubmit}
        maxLength={length}
        accessibilityLabel={accessibilityLabel}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        testID={testID === undefined ? undefined : `${testID}-input`}
      />
    </Pressable>
  );
}
