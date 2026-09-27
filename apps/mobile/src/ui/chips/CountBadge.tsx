import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface CountBadgeProps {
  readonly count: number;
  /** What is being counted, for screen readers ("5 unread messages"). */
  readonly accessibilityLabel?: string;
  /** Show over the top end corner of the parent. */
  readonly overlay?: boolean;
  readonly testID?: string;
}

const SIZE = 20;

const useStyles = makeStyles((t) => ({
  badge: {
    minWidth: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    paddingHorizontal: t.space['4'],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.state.urgent,
    borderWidth: 2,
    borderColor: t.semantic.bg.base,
  },
  overlay: { position: 'absolute', top: -t.space['6'], end: -t.space['6'] },
}));

/** Pink count bubble for tabs, bells and crew pills; hidden at zero, capped at 99+. */
export function CountBadge({
  count,
  accessibilityLabel,
  overlay = false,
  testID,
}: CountBadgeProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (count <= 0) return null;
  const shown = count > 99 ? '99+' : String(count);
  return (
    <View
      testID={testID}
      style={[styles.badge, overlay ? styles.overlay : null]}
      accessible
      accessibilityLabel={
        accessibilityLabel ?? t({ id: 'common.badge.new', message: `${count} new` })
      }
    >
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {shown}
      </Text>
    </View>
  );
}
