/**
 * The phone code in the 2.15 code tiles: six white tiles over one hidden one-time-code field (so
 * the SMS code autofills), each digit dropping into its tile as it lands. A code that checks out
 * rings every tile green; a wrong one rings them pink and shakes (still under Reduce Motion: the
 * rings alone say it).
 */
import { useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ring, SPRINGS, Text, usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';

import { SHAKE_LEG_MS } from '../components/onboarding-colours';

/** The phone flow's code state: a code that checks out, a wrong one, or neither yet. */
export type CodeStatus = 'idle' | 'valid' | 'invalid';

const LENGTH = 6;
/** How far a digit falls into its tile. */
const DROP_PT = 14;

function Tile({
  char,
  caret,
  status,
}: {
  readonly char: string;
  readonly caret: boolean;
  readonly status: CodeStatus;
}) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const drop = useSharedValue(0);
  useEffect(() => {
    if (char === '' || reduced) return;
    drop.value = -DROP_PT;
    drop.value = withSpring(0, SPRINGS.snappy);
  }, [char, reduced, drop]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: drop.value }],
    opacity: 1 + drop.value / DROP_PT / 2,
  }));
  const filled = char !== '';
  const outline =
    status === 'invalid'
      ? ring(theme.size.focusRing, theme.color.destructive.fieldRing, true)
      : status === 'valid'
        ? ring(theme.size.focusRing, theme.signal.successCheck, true)
        : filled || caret
          ? ring(theme.size.focusRing, theme.color.ink, true)
          : ring(theme.size.fieldBorder, theme.color.fieldBorder, true);
  return (
    <View
      style={{
        flex: 1,
        height: 64,
        borderRadius: theme.radius.segmentInner,
        backgroundColor: theme.color.card,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: outline,
      }}
    >
      <Animated.View style={style}>
        <Text variant="stat">{char}</Text>
      </Animated.View>
    </View>
  );
}

export interface OtpTilesProps {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly onComplete: (code: string) => void;
  readonly status: CodeStatus;
  readonly label: string;
  readonly autoFocus?: boolean;
  readonly testID?: string;
}

export function OtpTiles({
  value,
  onChangeText,
  onComplete,
  status,
  label,
  autoFocus = false,
  testID,
}: OtpTilesProps) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (status !== 'invalid' || reduced) return;
    shake.value = withSequence(
      withTiming(6, { duration: SHAKE_LEG_MS }),
      withTiming(-6, { duration: SHAKE_LEG_MS }),
      withTiming(6, { duration: SHAKE_LEG_MS }),
      withTiming(-6, { duration: SHAKE_LEG_MS }),
      withSpring(0, SPRINGS.snappy),
    );
  }, [status, reduced, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const onText = (text: string) => {
    const digits = text.replace(/\D/gu, '').slice(0, LENGTH);
    onChangeText(digits);
    if (digits.length === LENGTH) onComplete(digits);
  };
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={label}>
      <Animated.View
        style={[{ flexDirection: 'row', gap: theme.space.gap8 }, shakeStyle]}
        {...(testID === undefined ? {} : { testID: `${testID}-cells` })}
      >
        {Array.from({ length: LENGTH }, (_, i) => (
          <Tile key={i} char={value[i] ?? ''} caret={i === value.length} status={status} />
        ))}
      </Animated.View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={onText}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        accessibilityLabel={label}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        {...(testID === undefined ? {} : { testID })}
      />
    </Pressable>
  );
}
