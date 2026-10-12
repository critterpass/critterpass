/**
 * The in-app number pad (7.18): 1–9, 000, 0 and ⌫ as white keys in a 3 × 4 grid, a selection tick
 * on every press. The amount only ever takes this pad; the system keyboard never shows for it.
 */
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { LineIcon } from '@/features/trip';
import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

export type PadKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | '0' | 'delete';

const ROWS: readonly (readonly PadKey[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['000', '0', 'delete'],
];

export function AmountKeypad({
  onKey,
  deleteLabel,
}: {
  readonly onKey: (key: PadKey) => void;
  readonly deleteLabel: string;
}) {
  const th = usePremiumTheme();
  return (
    <View style={[styles.grid, { gap: th.space.gap8 }]} testID="money-keypad">
      {ROWS.map((row) => (
        <View key={row.join('')} style={[styles.row, { gap: th.space.gap8 }]}>
          {row.map((key) => (
            <PressableScale
              key={key}
              style={styles.cell}
              onPress={() => {
                void Haptics.selectionAsync();
                onKey(key);
              }}
              accessibilityRole="keyboardkey"
              accessibilityLabel={key === 'delete' ? deleteLabel : key}
              testID={`money-key-${key}`}
            >
              <View
                style={[
                  styles.key,
                  {
                    borderRadius: th.radius.banner,
                    backgroundColor: th.color.card,
                    boxShadow: th.shadow.float,
                  },
                ]}
              >
                {key === 'delete' ? (
                  <LineIcon name="backspace" size={24} color={th.color.ink} />
                ) : (
                  <Text variant="title" style={styles.digit}>
                    {key}
                  </Text>
                )}
              </View>
            </PressableScale>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {},
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
  key: { height: 56, alignItems: 'center', justifyContent: 'center' },
  digit: { fontWeight: '500' },
});
