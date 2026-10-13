/**
 * Picking the home currency in place, under its row: a search field (code or symbol), the home
 * airport's currency first (choosing it goes back to following the airport), then every currency
 * by code with the chosen one ticked. Picking one closes the list.
 */
import { ISO_CURRENCIES } from '@cp/cost-engine';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  enterTransition,
  Icon,
  ListCard,
  Row,
  Text,
  TextField,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { searchCurrencies } from '../../language/currency-sheet';

export function CurrencyChoice(props: {
  /** The home airport's currency, offered first. */
  readonly airportCurrency: string | null;
  /** The currency chosen now (null: following the airport). */
  readonly chosen: string | null;
  readonly onPick: (code: string | null) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const [query, setQuery] = useState('');
  const codes = searchCurrencies(query).filter((code) => code !== props.airportCurrency);
  const symbol = (code: string) => ISO_CURRENCIES[code]?.symbol ?? code;
  const tick = <Icon name="check" size={18} color={th.color.ink} />;
  return (
    <Animated.View
      entering={enterTransition(reduced)}
      style={{ gap: th.space.gap8 }}
      testID="you-currency-sheet"
    >
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t({ id: 'you.currency.search', message: 'Currency code, like SGD' })}
        accessibilityLabel={t({ id: 'you.currency.search', message: 'Currency code, like SGD' })}
        autoCapitalize="characters"
        autoCorrect={false}
        testID="you-currency-search"
      />
      {props.airportCurrency !== null && query === '' ? (
        <ListCard radius={20}>
          <Row
            title={`${props.airportCurrency} · ${symbol(props.airportCurrency)}`}
            subtitle={t({ id: 'you.currency.fromAirport', message: 'From your home airport' })}
            trailing={props.chosen === null ? tick : undefined}
            onPress={() => props.onPick(null)}
            testID="you-currency-airport"
          />
        </ListCard>
      ) : null}
      {codes.length === 0 ? (
        <View style={{ paddingHorizontal: 6, paddingVertical: th.space.gap8 }}>
          <Text variant="caption" tone="muted">
            {t({
              id: 'you.premium.currency.none',
              message: 'No currency matches that. Try its three-letter code.',
            })}
          </Text>
        </View>
      ) : (
        <ListCard radius={20}>
          {codes.map((code) => (
            <Row
              key={code}
              title={`${code} · ${symbol(code)}`}
              trailing={props.chosen === code ? tick : undefined}
              onPress={() => props.onPick(code)}
              testID={`you-currency-${code}`}
            />
          ))}
        </ListCard>
      )}
    </Animated.View>
  );
}
