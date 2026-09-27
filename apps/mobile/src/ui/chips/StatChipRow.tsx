import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface StatChip {
  readonly key: string;
  readonly value: string;
  readonly label: string;
}

export interface StatChipRowProps {
  readonly stats: readonly StatChip[];
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: t.space['4'],
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['6'],
    backgroundColor: t.semantic.bg.control,
  },
}));

/** A wrapping row of value + label stat chips ("12 critters", "3 stamps"). */
export function StatChipRow({ stats, testID }: StatChipRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row gap="8" wrap testID={testID}>
      {stats.map((stat) => (
        <View
          key={stat.key}
          style={styles.chip}
          accessible
          accessibilityLabel={`${stat.value} ${stat.label}`}
        >
          <Text variant="title">{stat.value}</Text>
          <Text variant="label" color={theme.semantic.text.secondary}>
            {stat.label}
          </Text>
        </View>
      ))}
    </Row>
  );
}
