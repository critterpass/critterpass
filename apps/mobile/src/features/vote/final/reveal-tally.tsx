/**
 * The reveal's tally card (3c-2): one row per finalist with its name in its own colour, who voted
 * for it and its score, the winner's score in full strength; lines for the viewer (a tie broken, a
 * missed vote, a losing pick) sit under the rows.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '@/ui/layout/Row';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface RevealTallyRow {
  readonly id: string;
  /** The place's name, in the case it is drawn in. */
  readonly name: string;
  readonly votes: number;
  readonly winner: boolean;
  readonly color: string;
  readonly voters?: ReactNode;
}

export interface RevealTallyProps {
  /** Read out for the whole card: "Kyoto wins 4–2; Kyoto, 4 votes; Lisbon, 2 votes". */
  readonly summary: string;
  readonly rows: readonly RevealTallyRow[];
  readonly children?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.base,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['16'],
    paddingVertical: th.space['8'],
  },
  row: { paddingVertical: th.space['10'] },
  divider: { borderTopWidth: 1, borderTopColor: th.semantic.bg.raised },
  name: { flexShrink: 1, minWidth: '24%', maxWidth: '45%' },
  voters: { flex: 1 },
  notes: { gap: th.space['8'], paddingVertical: th.space['8'] },
}));

export function RevealTally({ summary, rows, children }: RevealTallyProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <SurfaceToneProvider value="dark">
      <View style={styles.card}>
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={summary}
          testID="reveal-tally"
        >
          {rows.map((row, index) => (
            <Row
              key={row.id}
              gap="12"
              align="center"
              style={[styles.row, index > 0 ? styles.divider : null]}
            >
              <Text variant="title" color={row.color} style={styles.name}>
                {row.name}
              </Text>
              <View style={styles.voters}>{row.voters}</View>
              <Text
                variant="h2"
                color={row.winner ? theme.semantic.text.primary : theme.semantic.text.secondary}
              >
                {String(row.votes)}
              </Text>
            </Row>
          ))}
        </View>
        {children === undefined ? null : <View style={styles.notes}>{children}</View>}
      </View>
    </SurfaceToneProvider>
  );
}
