/**
 * The Money half's two sheets (premium): what the crew counts in, with the currencies an organiser
 * can switch to (re-rates the whole ledger on the server, so it goes online and says so), and which
 * trip Money shows when the crew has more than one.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon, ListCard, LoadingCritter, Row, Spinner, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { tripLabel } from '../balances/trip-label';
import { useSettlementCurrency } from '../balances/use-settlement-currency';
import { selectTrip, useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';

function close() {
  if (router.canGoBack()) router.back();
}

export function CurrencySheetScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const ctx = useMoneyContext(useSelectedTrip());
  const current = ctx.crew?.settlementCurrency ?? 'USD';
  const { pending, error, pick } = useSettlementCurrency(ctx.crew?.id ?? '', current, close);
  const choices = [
    ...new Set(
      [current, ctx.trip?.localCurrency ?? null, ctx.homeCurrency].filter(
        (value): value is string => value !== null,
      ),
    ),
  ];
  const organiser = ctx.crew?.organiser === true || ctx.trip?.organiser === true;
  return (
    <SheetScreen
      title={t({ id: 'money.currency.title', message: `The crew counts in ${current}` })}
      cancelLabel={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
      testID="money-currency"
    >
      <View style={{ gap: th.space.gap16 }}>
        <Text variant="body" tone="muted">
          {t({
            id: 'money.currency.body',
            message:
              'Spend in any currency. Balances and settling up use this one, at the rate on the day each expense was added.',
          })}
        </Text>
        {organiser && ctx.crew !== null ? (
          <ListCard testID="money-currency-choices">
            {choices.map((currency) => (
              <Row
                key={currency}
                title={currency}
                trailing={
                  currency === current ? (
                    <Icon name="check" size={18} />
                  ) : pending ? (
                    <Spinner />
                  ) : undefined
                }
                onPress={() => pick(currency)}
                testID={`money-currency-${currency}`}
              />
            ))}
          </ListCard>
        ) : (
          <Text variant="rowText" tone="muted">
            {t({ id: 'money.currency.organiserOnly', message: 'Only an organiser can switch it.' })}
          </Text>
        )}
        {error ? (
          <Text variant="helper" color={th.color.destructive.helper} testID="money-currency-error">
            {t({
              id: 'money.currency.error',
              message: "That didn't go through. Check your connection and try again.",
            })}
          </Text>
        ) : null}
      </View>
    </SheetScreen>
  );
}

export function TripSheetScreen() {
  const { t } = useLingui();
  const ctx = useMoneyContext(useSelectedTrip());
  const fallback = t({ id: 'money.trips.unnamed', message: 'Trip' });
  return (
    <SheetScreen
      title={t({ id: 'money.premium.whichTrip', message: 'Which trip' })}
      cancelLabel={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
      testID="money-trip-sheet"
    >
      {ctx.status === 'loading' ? (
        <LoadingCritter
          label={t({ id: 'money.premium.tripsLoading', message: 'Finding your trips…' })}
        />
      ) : ctx.trips.length === 0 ? (
        <Text variant="rowText" tone="muted" singleLine={false}>
          {t({
            id: 'money.premium.noTripLine',
            message: 'Expenses belong to a trip. Start one with the crew, then add it here.',
          })}
        </Text>
      ) : (
        <ListCard>
          {ctx.trips.map((trip) => (
            <Row
              key={trip.id}
              title={tripLabel(trip, fallback)}
              {...(trip.id === ctx.trip?.id ? { trailing: <Icon name="check" size={18} /> } : {})}
              onPress={() => {
                selectTrip(trip.id);
                close();
              }}
              testID={`money-trip-${trip.id}`}
            />
          ))}
        </ListCard>
      )}
    </SheetScreen>
  );
}
