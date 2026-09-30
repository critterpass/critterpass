/**
 * The timeline's hour grid (3e-2): Geist Mono labels and a hairline every two hours down the
 * gutter, decorative for screen readers (each block reads its own time).
 */
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { AXIS_GUTTER, labelHours, yOf, type Axis } from './geometry';

const useStyles = makeStyles((th) => ({
  row: { position: 'absolute', start: 0, end: 0, flexDirection: 'row', alignItems: 'flex-start' },
  label: { width: AXIS_GUTTER, marginTop: -th.space['6'] },
  line: { flex: 1, height: th.space['2'] / 2, backgroundColor: th.color.divider },
}));

export function TimelineGrid({ axis }: { readonly axis: Axis }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, start: 0, end: 0 }}
    >
      {labelHours(axis).map((hour) => (
        <View key={hour} style={[styles.row, { top: yOf(hour * 60, axis) }]}>
          <Text variant="monoData" color={theme.semantic.text.tertiary} style={styles.label}>
            {new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(hour % 24)}
          </Text>
          <View style={styles.line} />
        </View>
      ))}
    </View>
  );
}
