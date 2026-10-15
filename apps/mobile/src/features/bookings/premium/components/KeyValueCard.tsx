/**
 * A white card of key / value rows (7.06, 7.13): the key muted on the left at a fixed width, the
 * value strong on the right side, hairlines between rows. Empty values are left out, never shown
 * as a blank row. A row with `onPress` is a button (copy a code, open the terms); a `private`
 * value is covered in a problem report's screenshot.
 */
import { StyleSheet, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

export interface KeyValue {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  /** A confirmation code or a price: covered in a problem report's screenshot. */
  readonly private?: boolean;
  readonly onPress?: () => void;
}

export function KeyValueCard({
  rows,
  testID,
}: {
  readonly rows: readonly KeyValue[];
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  const shown = rows.filter((row) => row.value !== '');
  if (shown.length === 0) return null;
  return (
    <View
      style={[
        styles.card,
        {
          marginHorizontal: th.space.gutter,
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {shown.map((row, index) => {
        const value = (
          <Text
            variant="rowTextStrong"
            style={row.private === true ? null : styles.value}
            {...(row.mono === true ? { variant: 'mono' as const } : {})}
            selectable
          >
            {row.value}
          </Text>
        );
        const line = (
          <View
            style={[
              styles.row,
              index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
            ]}
          >
            <Text variant="caption" tone="muted" style={styles.key}>
              {row.label}
            </Text>
            {row.private === true ? (
              <PrivateContent style={styles.value}>{value}</PrivateContent>
            ) : (
              value
            )}
          </View>
        );
        return row.onPress === undefined ? (
          <View key={row.key} testID={`kv-${row.key}`}>
            {line}
          </View>
        ) : (
          <PressableScale
            key={row.key}
            onPress={row.onPress}
            pressedScale={0.99}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}, ${row.value}`}
            testID={`kv-${row.key}`}
          >
            {line}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  key: { width: 116, paddingTop: 1 },
  value: { flex: 1 },
});
