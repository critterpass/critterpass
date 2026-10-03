/**
 * Two of the crew's awards under the forms card (3m-1): the title in the guide's hand and who won
 * it, with the award's own number. The MVP's chip carries a gold edge.
 */
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', gap: th.space['10'] },
  chip: {
    flex: 1,
    borderWidth: 2,
    borderColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
    gap: th.space['2'],
  },
}));

export interface AwardChipCopy {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly mvp: boolean;
}

export function AwardChips({ chips }: { readonly chips: readonly AwardChipCopy[] }) {
  const styles = useStyles();
  const theme = useTheme();
  if (chips.length === 0) return null;
  return (
    <View style={styles.row} testID="recap-awards">
      {chips.map((chip) => (
        <View
          key={chip.id}
          style={[styles.chip, chip.mvp ? { borderColor: theme.color.gold.base } : null]}
          accessible
          accessibilityLabel={`${chip.title}: ${chip.detail}`}
          testID={`recap-award-${chip.id}`}
        >
          <Text variant="voice" color={theme.color.yellow}>
            {chip.title}
          </Text>
          <Text variant="rowTitle">{chip.detail}</Text>
        </View>
      ))}
    </View>
  );
}
