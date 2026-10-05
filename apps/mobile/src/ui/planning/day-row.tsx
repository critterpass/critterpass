/**
 * One day of the whole trip (7a-3): its number and weekday on a tile in the day's colour, title,
 * a summary line, a status tag (BOOKED, CLASH, RAIN, VOTE, TOO FAR) and how full it is.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface PlanningDayRowProps {
  readonly dayNo: number;
  readonly weekday: string;
  /** The day of the month ("17"): with it the tile reads weekday over date. */
  readonly dateLabel?: string | undefined;
  readonly color: string;
  readonly title: string;
  readonly summary?: string | undefined;
  /** A `PlanningTag`. */
  readonly tag?: ReactNode | undefined;
  /** `PaceBars`. */
  readonly pace?: ReactNode | undefined;
  readonly onPress?: (() => void) | undefined;
  /** Screen-reader words for the whole row. */
  readonly accessibilityLabel: string;
  readonly testID?: string | undefined;
}

const TILE = 42;

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    padding: t.space['8'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: t.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  end: { flexDirection: 'row', alignItems: 'center', gap: t.space['10'] },
}));

export function PlanningDayRow({
  dayNo,
  weekday,
  dateLabel,
  color,
  title,
  summary,
  tag,
  pace,
  onPress,
  accessibilityLabel,
  testID,
}: PlanningDayRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: color }]}>
          {dateLabel === undefined ? (
            <>
              <Text variant="title" color={theme.semantic.text.onAccent}>
                {String(dayNo)}
              </Text>
              <Text variant="label" color={theme.semantic.text.onAccent} numberOfLines={1}>
                {weekday}
              </Text>
            </>
          ) : (
            <>
              <Text variant="label" color={theme.semantic.text.onAccent} numberOfLines={1}>
                {weekday}
              </Text>
              <Text variant="title" color={theme.semantic.text.onAccent}>
                {dateLabel}
              </Text>
            </>
          )}
        </View>
        <View style={styles.body}>
          <Text variant="title" numberOfLines={1}>
            {title}
          </Text>
          {summary === undefined ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
              {summary}
            </Text>
          )}
        </View>
        <View style={styles.end}>
          {tag}
          {pace}
        </View>
      </View>
    </PressScale>
  );
}
