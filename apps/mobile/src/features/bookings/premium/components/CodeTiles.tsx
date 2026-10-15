/**
 * Six code tiles over one hidden field: the system's one-time-code fill and paste work, the
 * focused tile wears the ink ring and a wrong code turns every tile's ring pink.
 */
import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ring, Text, usePremiumTheme } from '@/ui/premium';

export function CodeTiles(props: {
  readonly value: string;
  readonly length: number;
  readonly onChange: (next: string) => void;
  readonly invalid: boolean;
  readonly accessibilityLabel: string;
  readonly autoFocus?: boolean;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const cells = Array.from({ length: props.length }, (_, i) => props.value[i] ?? '');
  const focusAt = Math.min(props.value.length, props.length - 1);
  return (
    <Pressable
      onPress={() => input.current?.focus()}
      accessible={false}
      style={[styles.row, { gap: th.space.gap8 }]}
    >
      {cells.map((char, i) => (
        <View
          key={i}
          style={[
            styles.tile,
            {
              height: th.size.field,
              borderRadius: th.radius.field,
              backgroundColor: th.color.card,
              boxShadow: props.invalid
                ? ring(th.size.focusRing, th.color.destructive.fieldRing)
                : i === focusAt
                  ? ring(th.size.focusRing, th.color.ink)
                  : ring(th.size.fieldBorder, th.color.fieldBorder, true),
            },
          ]}
        >
          <Text variant="navTitle" align="center">
            {char}
          </Text>
        </View>
      ))}
      <TextInput
        ref={input}
        value={props.value}
        onChangeText={(text) => props.onChange(text.replace(/\D/gu, '').slice(0, props.length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={props.length}
        autoFocus={props.autoFocus ?? true}
        caretHidden
        accessibilityLabel={props.accessibilityLabel}
        style={styles.hidden}
        testID={props.testID}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tile: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Kept on screen (a zero-size field loses the system's code suggestion) but out of sight.
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
