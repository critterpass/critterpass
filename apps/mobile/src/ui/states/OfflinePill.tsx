import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface OfflinePillProps {
  /** Overrides "No signal" ("Needs signal" on online-only actions). */
  readonly label?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.space['6'],
    minHeight: sizeToken(t.size.headerPill, 'height') - t.space['12'],
    paddingHorizontal: t.space['10'],
    borderRadius: t.radius.sm,
    backgroundColor: t.semantic.bg.control,
    borderWidth: 1.5,
    borderColor: t.semantic.state.warning,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.semantic.state.warning },
}));

/** The header status pill while offline; announced politely when it appears. */
export function OfflinePill({ label, testID }: OfflinePillProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = label ?? t({ id: 'common.offline.noSignal', message: 'No signal' });
  return (
    <View
      testID={testID}
      style={styles.pill}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dot} />
      <Text variant="label" color={theme.semantic.state.warning}>
        {text}
      </Text>
    </View>
  );
}
