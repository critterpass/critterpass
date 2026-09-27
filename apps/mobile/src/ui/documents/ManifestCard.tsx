import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';
import { paperColours } from './paper-colours';
import { PaperChrome } from './PaperChrome';

export interface ManifestRow {
  readonly key: string;
  readonly name: string;
  /** Seat, room or role ("34A", "Twin · Gion"). */
  readonly detail: string;
  /** Status chip or avatar at the end. */
  readonly trailing?: ReactNode;
}

export interface ManifestCardProps {
  /** "Crew manifest · SQ 938". */
  readonly title: string;
  readonly headEnd?: string;
  readonly rows: readonly ManifestRow[];
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  row: {
    paddingVertical: t.space['6'],
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: paperColours(t).border,
  },
  index: { width: 24 },
  name: { flex: 1 },
}));

/** A printed passenger/room manifest on paper: numbered mono rows of name, detail and status. */
export function ManifestCard({
  title,
  headEnd,
  rows,
  accessibilityLabel,
  testID,
}: ManifestCardProps) {
  const styles = useStyles();
  return (
    <PaperChrome
      headStart={title}
      {...(headEnd ? { headEnd } : {})}
      accessibilityLabel={accessibilityLabel}
      {...(testID ? { testID } : {})}
    >
      <View>
        {rows.map((row, index) => (
          <Row key={row.key} gap="8" align="center" style={styles.row}>
            <Text variant="monoData" style={styles.index}>
              {String(index + 1).padStart(2, '0')}
            </Text>
            <Text variant="rowTitle" style={styles.name} numberOfLines={1}>
              {row.name}
            </Text>
            <Text variant="monoData">{row.detail}</Text>
            {row.trailing}
          </Row>
        ))}
      </View>
    </PaperChrome>
  );
}
