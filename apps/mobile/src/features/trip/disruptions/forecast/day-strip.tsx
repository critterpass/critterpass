/**
 * The day strip of 3k-7: one column per day with a forecast (weekday, the day's theme, sun or
 * rain, the high, a bar filled from the bottom by the chance of rain, the percentage). Today is
 * highlighted; a column opens the day's hours.
 */
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { degrees, percent, weekday } from './copy';
import type { ForecastDay } from './model';

export interface DayStripProps {
  readonly days: readonly ForecastDay[];
  /** The plan's theme for a date, in the reader's language ("BATUR"). */
  readonly themeFor: (date: string) => string | null;
  readonly onOpenDay: (date: string) => void;
}

const BAR_HEIGHT = 28;
const BAR_WIDTH = 10;
const COLUMN_WIDTH = 56;

const useStyles = makeStyles((th) => ({
  column: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
    paddingVertical: th.space['10'],
    borderRadius: th.radius.md,
  },
  today: { backgroundColor: th.semantic.bg.control },
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: th.semantic.bg.sunken,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { backgroundColor: th.semantic.state.info, borderRadius: BAR_WIDTH / 2 },
}));

export function DayStrip({ days, themeFor, onOpenDay }: DayStripProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  return (
    <Card tone="raised" testID="forecast-days">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {days.map((day) => {
          const label = weekday(day.date, locale);
          const dayTheme = themeFor(day.date);
          const high = day.highC === null ? '–' : degrees(day.highC, locale);
          return (
            <PressScale
              key={day.date}
              onPress={() => onOpenDay(day.date)}
              accessibilityLabel={[label, dayTheme, high, percent(day.rainPct, locale)]
                .filter(Boolean)
                .join(', ')}
              testID={`forecast-day-${day.date}`}
            >
              <View style={[styles.column, day.today ? styles.today : null]}>
                <Stack gap="6" align="center">
                  <Text
                    variant="eyebrow"
                    color={day.today ? theme.semantic.action.primary : theme.semantic.text.primary}
                  >
                    {label}
                  </Text>
                  <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={1}>
                    {dayTheme ?? ' '}
                  </Text>
                  <Icon
                    name={day.wet ? 'rain' : 'sun'}
                    size={22}
                    color={day.wet ? theme.semantic.state.info : theme.semantic.action.primary}
                    decorative
                  />
                  <Text variant="title">{high}</Text>
                  <View style={styles.bar}>
                    <View
                      style={[
                        styles.fill,
                        { height: Math.max(3, (BAR_HEIGHT * day.rainPct) / 100) },
                      ]}
                    />
                  </View>
                  <Text variant="caption" color={theme.semantic.text.secondary}>
                    {percent(day.rainPct, locale)}
                  </Text>
                </Stack>
              </View>
            </PressScale>
          );
        })}
      </ScrollView>
    </Card>
  );
}
