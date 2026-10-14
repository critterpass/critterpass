/**
 * What the free plan includes (9.17's free state, undesigned; built from the kit's list rows): one
 * row per line of the compare table with the free column's value ("30 a day", "6", ✓ or –), so
 * the page says what you have before it says what Pass+ adds.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { ListCard, Row, Text } from '@/ui/premium';

import type { CompareCell, CompareRowSpec } from '../../perks/perk-copy';

export function FreePlanList({ rows }: { readonly rows: readonly CompareRowSpec[] }) {
  const { t, i18n } = useLingui();
  if (rows.length === 0) return null;
  const value = (cell: CompareCell) =>
    cell.kind === 'text'
      ? i18n._(cell.copy)
      : cell.kind === 'yes'
        ? t({ id: 'monetize.compare.yes', message: '✓' })
        : t({ id: 'monetize.compare.no', message: '–' });
  return (
    <View style={styles.group}>
      <Text variant="label" tone="muted" style={styles.label}>
        {t({ id: 'monetize.plan.freeIncludes', message: 'On the free plan' })}
      </Text>
      <ListCard testID="plan-free-includes">
        {rows.map((row) => (
          <Row
            key={row.id}
            title={i18n._(row.label)}
            trailingText={value(row.cells[0])}
            testID={`plan-free-${row.id}`}
          />
        ))}
      </ListCard>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { paddingHorizontal: 6 },
});
