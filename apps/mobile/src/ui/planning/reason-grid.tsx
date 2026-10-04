/**
 * Why a time was picked (7f-1 WHY 08:00): reasons as tiles, two to a row, each with its doodle.
 */
import { View } from 'react-native';

import { Icon } from '../icons/Icon';
import type { DoodleName } from '../icons/generated';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface Reason {
  readonly key: string;
  readonly icon: DoodleName;
  readonly text: string;
}

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['8'] },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    minHeight: 44,
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['8'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
  },
  text: { flex: 1, minWidth: 0 },
}));

export function ReasonGrid({
  reasons,
  onSheet = false,
  testID,
}: {
  readonly reasons: readonly Reason[];
  /** On a sheet, whose panel is already raised: the tiles take the darker control fill. */
  readonly onSheet?: boolean;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.grid} testID={testID}>
      {reasons.map((reason) => (
        <View
          key={reason.key}
          style={[styles.tile, onSheet ? { backgroundColor: theme.semantic.bg.control } : null]}
          accessible
          accessibilityLabel={reason.text}
        >
          <Icon name={reason.icon} size={18} color={theme.semantic.action.primary} decorative />
          <View style={styles.text}>
            <Text variant="bodySm">{reason.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
