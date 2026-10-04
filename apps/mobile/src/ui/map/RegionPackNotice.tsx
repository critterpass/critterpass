/**
 * The one line a map shows while its destination has no detailed tiles yet (undesigned; a quiet
 * pill over the foot of the map). It sits above the row of the map's mark and attribution button,
 * never beside them, and above whatever sheet covers the map's foot; a long name wraps onto a
 * second line inside the gutters. It never takes a touch, so the map under it still pans.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

const useStyles = makeStyles((t) => ({
  over: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: t.space['20'],
  },
  // Under a map too small to carry the line over its pins.
  under: { alignItems: 'center', paddingTop: t.space['8'] },
  pill: {
    maxWidth: '100%',
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['6'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.base,
  },
}));

export interface RegionPackNoticeProps {
  /** The destination's name, as the app shows it. */
  readonly place: string;
  /** How far above the map's foot the line sits, in points. Unset, the line is laid out in the
   *  flow instead, for a small framed map that puts it underneath. */
  readonly bottom?: number | undefined;
}

/** The height of the map's mark and attribution row, with the gap kept above it. */
const ORNAMENT_ROW = 52;
const ABOVE_SHEET = 12;

/**
 * The room the line takes above a sheet (its pill, the gap under it and one above): a screen that
 * fits its camera to the uncovered map adds this to the covered foot while the line shows, so the
 * stay and the fitted stops never sit under it.
 */
export const NOTICE_ROOM = 64;

/**
 * Where the line sits on a map that runs to the foot of the screen: above the ornament row (which
 * the map itself lifts by the bottom inset) and above the sheet covering the map's foot.
 */
export function noticeBottom(input: {
  readonly ornamentBottom: number;
  readonly insetBottom: number;
  readonly coveredBottom?: number | undefined;
}): number {
  return Math.max(
    input.ornamentBottom + input.insetBottom + ORNAMENT_ROW,
    (input.coveredBottom ?? 0) + ABOVE_SHEET,
  );
}

export function RegionPackNotice({ place, bottom }: RegionPackNoticeProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <View
      style={bottom === undefined ? styles.under : [styles.over, { bottom }]}
      pointerEvents="none"
      testID="map-region-pack-notice"
    >
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
