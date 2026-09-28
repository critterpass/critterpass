/**
 * Day separator: TODAY, YESTERDAY, the weekday within the last week, then a short date, in the
 * viewer's zone and locale.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { daysBetween, shortDateOf, weekdayOf } from './format';

const useStyles = makeStyles((th) => ({
  row: { alignSelf: 'center', paddingVertical: th.space['12'] },
}));

/** Label for a `YYYY-MM-DD` day relative to `today` (also `YYYY-MM-DD`). */
export function dayLabel(day: string, today: string, locale: string): string {
  const diff = daysBetween(day, today);
  if (diff === 0) return t({ id: 'chat.day.today', message: 'Today' });
  if (diff === 1) return t({ id: 'chat.day.yesterday', message: 'Yesterday' });
  if (diff > 1 && diff < 7) return weekdayOf(day, locale);
  return shortDateOf(day, locale);
}

export function DaySeparator({ day, today }: { readonly day: string; readonly today: string }) {
  const styles = useStyles();
  const locale = useLocale();
  return (
    <View style={styles.row} accessible accessibilityRole="header">
      <Text variant="eyebrow">{dayLabel(day, today, locale)}</Text>
    </View>
  );
}
