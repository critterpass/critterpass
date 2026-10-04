/**
 * The one line a map shows while its destination has no detailed tiles yet (undesigned; a quiet
 * pill over the foot of the map). It never takes a touch, so the map under it still pans.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

const useStyles = makeStyles((t) => ({
  row: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    maxWidth: '80%',
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['6'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.base,
  },
}));

export interface RegionPackNoticeProps {
  /** The destination's name, as the app shows it. */
  readonly place: string;
  /** How far above the map's foot the line sits, in points. */
  readonly bottom: number;
}

export function RegionPackNotice({ place, bottom }: RegionPackNoticeProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <View style={[styles.row, { bottom }]} pointerEvents="none" testID="map-region-pack-notice">
      <View style={styles.pill}>
        <Text
          variant="caption"
          color={theme.semantic.text.secondary}
          singleLine={false}
          style={{ textAlign: 'center' }}
        >
          {t({
            id: 'common.map.regionPackOnItsWay',
            message: `A detailed map of ${place} is on its way.`,
          })}
        </Text>
      </View>
    </View>
  );
}
