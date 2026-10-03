/**
 * Picking the home currency (undesigned; built from the sheet, search field and list cards): the
 * home airport's currency first (choosing it goes back to following the airport), then every
 * currency by code, searchable by code or symbol.
 */
import { ISO_CURRENCIES } from '@cp/cost-engine';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { ListCard } from '@/ui/cards/ListCard';
import { SearchField } from '@/ui/inputs/SearchField';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'], gap: t.space['12'] },
}));

/** Currency codes matching `query` (code or symbol), all of them for an empty query. */
export function searchCurrencies(query: string): string[] {
  const q = query.trim().toLowerCase();
  return Object.values(ISO_CURRENCIES)
    .filter(
      (c) => q === '' || c.code.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q),
    )
    .map((c) => c.code)
    .sort((a, b) => a.localeCompare(b));
}

export function CurrencySheet(props: {
  /** The home airport's currency, offered first. */
  readonly airportCurrency: string | null;
  /** The currency chosen now (null: following the airport). */
  readonly chosen: string | null;
  readonly onPick: (code: string | null) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const title = t({ id: 'you.currency.home', message: 'Home currency' });
  const codes = searchCurrencies(query).filter((code) => code !== props.airportCurrency);
  const symbol = (code: string) => ISO_CURRENCIES[code]?.symbol ?? code;
  return (
    <Sheet detents={['large']} title={title} onDismiss={props.onClose} testID="you-currency-sheet">
      <View style={styles.body}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t({ id: 'you.currency.search', message: 'Currency code, like SGD' })}
          testID="you-currency-search"
        />
      </View>
      <SheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Stack gap="8">
          {props.airportCurrency !== null && query === '' ? (
            <ListCard
              title={`${props.airportCurrency} · ${symbol(props.airportCurrency)}`}
              subtitle={t({ id: 'you.currency.fromAirport', message: 'From your home airport' })}
              onPress={() => props.onPick(null)}
              testID="you-currency-airport"
            />
          ) : null}
          {codes.map((code) => (
            <ListCard
              key={code}
              title={`${code} · ${symbol(code)}`}
              {...(props.chosen === code
                ? { subtitle: t({ id: 'you.currency.chosen', message: 'Your home currency now' }) }
                : {})}
              onPress={() => props.onPick(code)}
              testID={`you-currency-${code}`}
            />
          ))}
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}
