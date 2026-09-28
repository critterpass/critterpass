import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { SearchField } from '@/ui/inputs/SearchField';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { airportDataset } from '../content';
import { countryList } from './phone-number';

const useStyles = makeStyles((th) => ({
  // The list runs to the sheet's bottom edge; the sheet already pads for the home indicator.
  body: { flex: 1, paddingHorizontal: th.space['20'], gap: th.space['12'] },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: th.space['12'],
  },
}));

/** The country code picker (undesigned): searchable list, name and calling code per row. */
export function CountryPicker({
  onPick,
  onClose,
}: {
  readonly onPick: (country: string) => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const all = useMemo(
    () => countryList(locale, (code) => airportDataset().countries[code]?.name),
    [locale],
  );
  const q = query.trim().toLowerCase();
  const rows =
    q.length === 0
      ? all
      : all.filter(
          (c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q.replace('+', '')),
        );
  const title = t({ id: 'onboarding.phone.country', message: 'Country' });
  return (
    <Sheet
      detents={['large']}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="country-picker"
    >
      <View style={styles.body}>
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t({ id: 'onboarding.phone.countrySearch', message: 'Search countries' })}
        />
        <FlatList
          style={styles.list}
          data={rows}
          keyExtractor={(row) => row.code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <PressScale
              onPress={() => onPick(item.code)}
              accessibilityLabel={`${item.name}, +${item.dial}`}
              widthClass="wide"
              testID={`country-${item.code}`}
            >
              <View style={styles.row}>
                <Text variant="body">{item.name}</Text>
                <Text variant="body" color={theme.semantic.text.secondary}>
                  +{item.dial}
                </Text>
              </View>
            </PressScale>
          )}
        />
      </View>
    </Sheet>
  );
}
