import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface EtaEntry {
  readonly id: string;
  /** "Maya and Rin". */
  readonly name: string;
  readonly avatar?: ReactNode;
  /** "Leaving Karsa Spa". */
  readonly status: string;
  /** Arrival time ("16:52"); omit when sharing is paused. */
  readonly eta?: string;
}

export interface EtaListProps {
  readonly entries: readonly EtaEntry[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    alignItems: 'center',
    gap: th.space['12'],
    paddingVertical: th.space['10'],
    borderBottomWidth: th.space['2'] / 2,
    borderBottomColor: th.color.divider,
  },
}));

/** Who is heading to the meet-up, what they are doing and when they arrive. */
export function EtaList({ entries, testID }: EtaListProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack testID={testID}>
      {entries.map((entry) => {
        const eta = entry.eta;
        const arrival = eta
          ? t({ id: 'common.trip.arrivesAt', message: `arrives ${eta}` })
          : undefined;
        return (
          <Row
            key={entry.id}
            style={styles.row}
            accessible
            accessibilityRole="text"
            accessibilityLabel={[entry.name, entry.status, arrival].filter(Boolean).join(', ')}
          >
            {entry.avatar}
            <Stack gap="2" flex={1}>
              <Text variant="rowTitle">{entry.name}</Text>
              <SecondaryText>{entry.status}</SecondaryText>
            </Stack>
            <Text variant="monoData" color={eta ? undefined : theme.semantic.text.secondary}>
              {eta ?? '–'}
            </Text>
          </Row>
        );
      })}
    </Stack>
  );
}
