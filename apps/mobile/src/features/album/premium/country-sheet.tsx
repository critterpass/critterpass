/**
 * The country picker over the address form, in the premium look (undesigned; the premium sheet
 * with the kit's field and rows): search by name, one row per country.
 */
import { t } from '@lingui/core/macro';
import { useDeferredValue, useMemo, useState } from 'react';
import { View } from 'react-native';

import { countryList, regionName } from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';
import { ListCard, Row, SearchField } from '@/ui/premium';

import { PremiumSheet } from './premium-sheet';

export function PremiumCountrySheet(props: {
  readonly onPick: (code: string) => void;
  readonly onClose: () => void;
}) {
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const all = useMemo(() => countryList(locale, (code) => regionName(code, locale)), [locale]);
  const q = useDeferredValue(query).trim().toLowerCase();
  const rows = q.length === 0 ? all : all.filter((c) => c.name.toLowerCase().includes(q));
  const search = t({ id: 'onboarding.phone.countrySearch', message: 'Search countries' });
  return (
    <PremiumSheet
      title={t({ id: 'onboarding.phone.country', message: 'Country' })}
      onClose={props.onClose}
      testID="country-picker"
    >
      <View style={{ gap: 12 }}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={search}
          accessibilityLabel={search}
          autoCorrect={false}
          testID="country-search"
        />
        <ListCard>
          {rows.map((row) => (
            <Row
              key={row.code}
              title={row.name}
              onPress={() => props.onPick(row.code)}
              testID={`country-${row.code}`}
            />
          ))}
        </ListCard>
      </View>
    </PremiumSheet>
  );
}
