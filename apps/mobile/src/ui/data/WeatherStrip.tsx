import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { Icon } from '../icons/Icon';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { GrowBar } from './LinearBar';

export interface WeatherDay {
  /** Short weekday ("Wed"). */
  readonly day: string;
  /** What the day holds ("Ubud", "Boat"). */
  readonly place?: string;
  /** Pre-formatted temperature in the user's unit ("31°"). */
  readonly temperature: string;
  /** Chance of rain, 0 to 1. */
  readonly rain: number;
}

export interface WeatherStripProps {
  readonly days: readonly WeatherDay[];
  /** Rain chance at or above which the day shows the rain doodle and blue bar. @default 0.5 */
  readonly rainyFrom?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', gap: th.space['6'] },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: th.space['4'],
    paddingVertical: th.space['10'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.raised,
  },
  rainWell: {
    width: th.space['8'],
    height: th.space['32'],
    borderRadius: th.radius.xs,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
}));

/** Day-by-day forecast cells with rain bars filling from the bottom; one spoken line per day. */
export function WeatherStrip({ days, rainyFrom = 0.5, testID }: WeatherStripProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const summary = days
    .map((day) => {
      const rain = format.percent(locale, day.rain);
      const where = day.place ? `${day.day} ${day.place}` : day.day;
      const temp = day.temperature;
      return t({
        id: 'common.data.weatherDay',
        message: `${where}: ${temp}, ${rain} chance of rain`,
      });
    })
    .join('; ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={styles.row}
    >
      {days.map((day, index) => {
        const rainy = day.rain >= rainyFrom;
        return (
          <View key={`${day.day}${index}`} style={styles.cell}>
            <Text variant="eyebrow">{day.day}</Text>
            {day.place ? (
              <Text variant="label" numberOfLines={1}>
                {day.place}
              </Text>
            ) : null}
            <Icon name={rainy ? 'rain' : 'sun'} size={theme.space['24']} decorative />
            <Text variant="h3">{day.temperature}</Text>
            <View style={styles.rainWell}>
              <GrowBar
                axis="y"
                fraction={day.rain}
                index={index}
                color={rainy ? theme.semantic.state.info : theme.color.ink['600']}
              />
            </View>
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {format.percent(locale, day.rain)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
