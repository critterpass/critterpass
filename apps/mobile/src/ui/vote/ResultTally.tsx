import type { ReactNode } from 'react';
import { View } from 'react-native';

import { votesLabel } from '../data/PollBars';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface TallyRow {
  readonly id: string;
  readonly name: string;
  readonly votes: number;
  readonly voters?: ReactNode;
  readonly color: string;
  readonly winner?: boolean;
}

export interface ResultTallyProps {
  /** "Kyoto wins 4–2". */
  readonly headline: string;
  readonly rows: readonly TallyRow[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.base,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
  },
  row: { paddingVertical: th.space['8'], alignItems: 'center', gap: th.space['12'] },
  swatch: { width: th.space['8'], alignSelf: 'stretch', borderRadius: th.radius.xs },
}));

/** Closed vote result: one row per option with voters and score; the winner row leads. */
export function ResultTally({ headline, rows, testID }: ResultTallyProps) {
  const styles = useStyles();
  const theme = useTheme();
  const summary = [headline, ...rows.map((row) => `${row.name}, ${votesLabel(row.votes)}`)].join(
    '; ',
  );
  return (
    <Stack
      gap="4"
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={summary}
      style={styles.card}
    >
      {rows.map((row) => (
        <Row key={row.id} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: row.color }]} />
          <Stack gap="4" flex={1}>
            <Text
              variant={row.winner ? 'h2' : 'h3'}
              color={row.winner ? undefined : theme.semantic.text.secondary}
            >
              {row.name}
            </Text>
            {row.voters}
          </Stack>
          <Text
            variant={row.winner ? 'displayXl' : 'h2'}
            color={row.winner ? row.color : theme.semantic.text.secondary}
          >
            {String(row.votes)}
          </Text>
        </Row>
      ))}
    </Stack>
  );
}
