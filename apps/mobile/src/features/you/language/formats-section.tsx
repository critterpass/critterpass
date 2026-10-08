/**
 * FORMATS on Language and currency (3n-8): one "Time and distance" row ("24-hour · km ›") opening
 * a sheet with the clock (12- or 24-hour) and distance (km or mi) choices.
 */
/* eslint-disable lingui/no-unlocalized-strings -- format values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import type { DistanceUnit, TimeFormat } from '@/lib/i18n/formats';
import { RadioCard } from '@/ui/inputs/RadioCard';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['20'], gap: t.space['10'] },
}));

export function useFormatWords() {
  const { t } = useLingui();
  return {
    time: (value: TimeFormat) =>
      value === '12h'
        ? t({ id: 'you.formats.twelveHour', message: '12-hour' })
        : t({ id: 'you.formats.twentyFourHour', message: '24-hour' }),
    distance: (value: DistanceUnit) =>
      value === 'mi'
        ? t({ id: 'you.formats.mi', message: 'mi' })
        : t({ id: 'you.formats.km', message: 'km' }),
  };
}

export function FormatsSection(props: {
  readonly time: TimeFormat;
  readonly distance: DistanceUnit;
  readonly onOpen: () => void;
}) {
  const { t } = useLingui();
  const words = useFormatWords();
  const title = t({ id: 'you.formats.row', message: 'Time and distance' });
  const value = `${words.time(props.time)} · ${words.distance(props.distance)}`;
  return (
    <SettingsGroup
      title={t({ id: 'you.formats.title', message: 'Formats' })}
      rows={[
        {
          key: 'formats',
          kind: 'value',
          title,
          value,
          onPress: props.onOpen,
          testID: 'you-formats-row',
        },
      ]}
      testID="you-formats"
    />
  );
}

export function FormatsSheet(props: {
  readonly time: TimeFormat;
  readonly distance: DistanceUnit;
  readonly onTime: (value: TimeFormat) => void;
  readonly onDistance: (value: DistanceUnit) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const words = useFormatWords();
  const title = t({ id: 'you.formats.row', message: 'Time and distance' });
  return (
    <Sheet detents={['fit']} title={title} onDismiss={props.onClose} testID="you-formats-sheet">
      <View style={styles.body}>
        <Text variant="eyebrow" accessibilityRole="header">
          {t({ id: 'you.formats.clock', message: 'Clock' })}
        </Text>
        {(['24h', '12h'] as const).map((value) => (
          <RadioCard
            key={value}
            title={words.time(value)}
            selected={props.time === value}
            onSelect={() => props.onTime(value)}
            testID={`you-formats-time-${value}`}
          />
        ))}
        <Text variant="eyebrow" accessibilityRole="header">
          {t({ id: 'you.formats.distance', message: 'Distance' })}
        </Text>
        {(['km', 'mi'] as const).map((value) => (
          <RadioCard
            key={value}
            title={
              value === 'km'
                ? t({ id: 'you.formats.kmLong', message: 'Kilometres' })
                : t({ id: 'you.formats.miLong', message: 'Miles' })
            }
            selected={props.distance === value}
            onSelect={() => props.onDistance(value)}
            testID={`you-formats-distance-${value}`}
          />
        ))}
      </View>
    </Sheet>
  );
}
