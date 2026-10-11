/**
 * The comparison table (6.23): a key column and one column per shortlisted driver. A column head is
 * his avatar, name and either "N missing" (maybe tint) or "Complete" (booked tint); a row is a key
 * over centred values. A line he has not said reads "Not said" in tangerine ink and opens the
 * question in WhatsApp; with no one price to quote, the price cell asks him the same way.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { Avatar, PressableScale, StatusTag, Text, usePremiumTheme } from '@/ui/premium';

import type { CompareCell, CompareRow } from '../../compare/use-compare';
import type { ShortlistDriver } from '../../shared/api';

export const KEY_COLUMN = 76;
export const TABLE_GAP = 6;

function Cell({ cell, testID }: { readonly cell: CompareCell; readonly testID: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const asking = th.color.status.maybe.text;
  if (cell.kind === 'text') {
    return (
      <Text
        variant="caption"
        align="center"
        color={
          cell.tone === 'good'
            ? th.color.status.booked.text
            : cell.tone === 'risk'
              ? asking
              : undefined
        }
        testID={testID}
      >
        {cell.text}
      </Text>
    );
  }
  if (cell.kind === 'notSaid') {
    return (
      <PressableScale
        onPress={cell.ask}
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'drivers.compare.notSaidHint',
          message: 'Not said. Ask him on WhatsApp',
        })}
        testID={testID}
      >
        <Text variant="rowTextStrong" align="center" color={asking}>
          {t({ id: 'drivers.compare.notSaid', message: 'Not said' })}
        </Text>
      </PressableScale>
    );
  }
  return (
    <View style={styles.price} testID={testID}>
      {cell.ask === null ? (
        <Text variant="caption" align="center">
          {cell.price ?? '—'}
        </Text>
      ) : (
        <PressableScale
          onPress={cell.ask}
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'drivers.compare.askPriceHint',
            message: 'No one price yet. Ask him on WhatsApp',
          })}
        >
          <Text variant="rowTextStrong" align="center" color={asking}>
            {t({ id: 'drivers.compare.askPrice', message: 'Ask him' })}
          </Text>
        </PressableScale>
      )}
      {cell.ask === null || cell.tiers.length > 0 || cell.askWords === null ? null : (
        <Text variant="captionMuted" tone="muted" align="center" numberOfLines={3}>
          {cell.askWords}
        </Text>
      )}
      {cell.tiers.map((tier) => (
        <Text key={tier} variant="captionMuted" tone="muted" align="center" numberOfLines={2}>
          {tier}
        </Text>
      ))}
    </View>
  );
}

export function CompareTable(props: {
  readonly drivers: readonly ShortlistDriver[];
  readonly missing: readonly number[];
  readonly rows: readonly CompareRow[];
  readonly column: number;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const width = { width: props.column };
  return (
    <View style={styles.table}>
      <View style={styles.line}>
        <View style={styles.key} />
        {props.drivers.map((driver, index) => {
          const missing = props.missing[index] ?? 0;
          return (
            <View
              key={driver.id}
              style={[styles.head, width]}
              testID={`drivers-compare-col-${index}`}
            >
              <Avatar name={driver.name} color={crewAccent(index + 2)} size={40} />
              <Text variant="rowTextStrong" numberOfLines={1}>
                {driver.name}
              </Text>
              <StatusTag
                label={
                  missing === 0
                    ? t({ id: 'drivers.compare.complete', message: 'Complete' })
                    : t({ id: 'drivers.compare.missing', message: `${missing} missing` })
                }
                tone={missing === 0 ? 'booked' : 'maybe'}
              />
            </View>
          );
        })}
      </View>
      {props.rows.map((row) => (
        <View
          key={row.key}
          style={[styles.line, styles.row, { borderTopColor: th.color.hairline }]}
        >
          <Text variant="captionMuted" tone="muted" style={styles.key}>
            {row.label}
          </Text>
          {props.drivers.map((driver, index) => {
            const cell = row.cells[index];
            return (
              <View key={driver.id} style={width}>
                {cell === undefined ? null : (
                  <Cell
                    cell={cell}
                    testID={`drivers-compare-${row.key === 'day' ? 'price' : row.key}-${driver.id}`}
                  />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { gap: 2 },
  line: { flexDirection: 'row', gap: TABLE_GAP, alignItems: 'flex-start' },
  key: { width: KEY_COLUMN },
  head: { alignItems: 'center', gap: 4, paddingBottom: 6 },
  row: { borderTopWidth: 0.5, paddingVertical: 8 },
  price: { gap: 2 },
});
