import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface ComparisonColumn {
  readonly id: string;
  /** "Free", "Pass+", "Boost". */
  readonly label: string;
}

export interface ComparisonRow {
  readonly label: string;
  /** One cell per column, in column order ("30 a day", "∞", "–"). */
  readonly values: readonly string[];
}

export interface ComparisonTableProps {
  readonly columns: readonly ComparisonColumn[];
  readonly rows: readonly ComparisonRow[];
  /** Column under the highlighter band. */
  readonly highlighted: string;
  readonly onHighlight?: (id: string) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    paddingVertical: th.space['10'],
    borderBottomWidth: th.space['2'] / 2,
    borderBottomColor: th.color.paper.muted,
    alignItems: 'center',
  },
  cell: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  // A value that wraps ("∞ on trip") stays centred on its column.
  value: { textAlign: 'center' },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: th.radius.sm,
    backgroundColor: th.semantic.action.primary,
    opacity: 0.5,
  },
}));

/** Plan comparison with a highlighter band on the chosen column; each row reads across all plans. */
export function ComparisonTable({
  columns,
  rows,
  highlighted,
  onHighlight,
  testID,
}: ComparisonTableProps) {
  const styles = useStyles();
  const theme = useTheme();
  const index = Math.max(
    0,
    columns.findIndex((column) => column.id === highlighted),
  );
  // One column grid for the header, every row and the band: the label takes two shares, each plan
  // one. Fixed percentages rather than flex, so a wide value ("30 a day") can't nudge its column.
  const share = 100 / (columns.length + 2);
  const labelWidth = { width: `${2 * share}%` } as const;
  const cellWidth = { width: `${share}%` } as const;
  return (
    <View testID={testID}>
      <View
        pointerEvents="none"
        testID={testID ? `${testID}-band` : undefined}
        style={[styles.band, { start: `${(2 + index) * share}%`, ...cellWidth }]}
      />
      <Stack>
        <Row style={styles.row} accessibilityRole="tablist">
          <View style={labelWidth} />
          {columns.map((column) => {
            const selected = column.id === highlighted;
            return (
              <PressScale
                key={column.id}
                accessibilityRole="tab"
                accessibilityLabel={column.label}
                accessibilityState={{ selected }}
                {...(onHighlight ? { onPress: () => onHighlight(column.id) } : {})}
                widthClass="narrow"
                style={[styles.cell, cellWidth]}
              >
                <Text
                  variant="label"
                  color={selected ? theme.color.paper.ink : theme.color.paper.muted}
                >
                  {column.label}
                </Text>
              </PressScale>
            );
          })}
        </Row>
        {rows.map((row) => (
          <Row
            key={row.label}
            style={styles.row}
            accessible
            accessibilityRole="text"
            accessibilityLabel={[
              row.label,
              ...columns.map((column, i) => `${column.label} ${row.values[i] ?? ''}`),
            ].join(', ')}
          >
            <Text variant="bodySm" color={theme.color.paper.ink} style={labelWidth}>
              {row.label}
            </Text>
            {columns.map((column, i) => (
              <View key={column.id} style={[styles.cell, cellWidth]}>
                <Text
                  variant="label"
                  style={styles.value}
                  color={
                    column.id === highlighted ? theme.color.paper.ink : theme.color.paper.muted
                  }
                >
                  {row.values[i] ?? ''}
                </Text>
              </View>
            ))}
          </Row>
        ))}
      </Stack>
    </View>
  );
}
