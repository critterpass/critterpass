/** The open day map's day pill (7b-2 "WED 14 · SLOW UBUD ▾"), in the day's colour; opens the picker. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dateLine, withArea } from '../trip-map/format';
import type { TripDay } from '../trip-map/trip-days';

const useStyles = makeStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    minHeight: 48,
    paddingHorizontal: t.space['16'],
    borderRadius: 24,
  },
  label: { flex: 1, minWidth: 0 },
}));

export function DayPill({
  day,
  locale,
  onPress,
}: {
  readonly day: TripDay;
  readonly locale: string;
  readonly onPress: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const n = day.dayNo;
  const date =
    day.date === null
      ? t({ id: 'plan.dayPlan.dayTitle', message: `Day ${n}` })
      : dateLine(locale, day.date);
  const named = withArea(date, day);
  const label = day.theme === null ? named : `${named} · ${day.theme}`;
  return (
    <PressScale
      style={{ flex: 1 }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t({ id: 'plan.dayPlan.pickDayHint', message: 'Pick another day' })}
      testID="day-map-day-pill"
    >
      <View style={[styles.pill, { backgroundColor: day.color }]}>
        <Text variant="label" color={theme.color.paper.ink} style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="label" color={theme.color.paper.ink}>
          ▾
        </Text>
      </View>
    </PressScale>
  );
}
