/**
 * The Wallet tab, Money half (premium; 7.16 and 7.17 as one page): "Wallet" with the ink `+` that
 * adds an expense, the Bookings | Money switch, then who owes whom, the chart, settle up and the
 * latest expense. Before the first expense it offers the three ways to start. Renders offline.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { WalletGuideProvider } from '@/features/bookings';
import { WalletHalfSwitchPremium } from '@/features/bookings';
import { Button, OfflinePill, Skeleton, Text, usePremiumTheme } from '@/ui/premium';
import { RootScreen, type ShellAction } from '@/ui/premium/shell';

import { tripLabel } from '../balances/trip-label';
import {
  balancesNav,
  useBalancesScreen,
  type BalancesReady,
} from '../balances/use-balances-screen';
import { MONEY_ROUTES } from '../routes';
import { BalanceBars } from './components/BalanceBars';
import { BalanceHero } from './components/BalanceHero';
import { EmptyMoney, MoneyNone } from './components/EmptyMoney';
import { ExpenseRow } from './components/ExpenseRow';
import { MoneyActions } from './components/MoneyActions';
import { MONEY_SHEETS } from './money-sheets';

function Ready({ state }: { readonly state: BalancesReady }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { model, items, currency, ctx, trip } = state;
  const latest = items[0] ?? null;
  const taps = model.plan.length;
  return (
    <>
      {ctx.trips.length > 1 ? (
        <View style={[styles.tripRow, { paddingHorizontal: th.space.gutter }]}>
          <Button
            label={`${tripLabel(trip, t({ id: 'money.trips.unnamed', message: 'Trip' }))} ⌄`}
            variant="floating"
            size="small"
            onPress={() => router.push(MONEY_SHEETS.trip)}
            testID="money-trip-chip"
          />
        </View>
      ) : null}
      <BalanceHero
        kind={model.hero.kind}
        amountMinor={state.solo ? model.totalSpentMinor : model.hero.amountMinor}
        currency={currency}
        solo={state.solo}
        onCurrency={() => router.push(MONEY_SHEETS.currency)}
      />
      {state.solo ? (
        <Text
          variant="body"
          tone="muted"
          style={{ paddingHorizontal: th.space.titleGutter }}
          testID="money-solo"
        >
          {t({
            id: 'money.solo.line',
            message:
              "It's just you in this crew for now, so there's nothing to split. Once crewmates join, the expenses you share are split and I keep who-owes-who straight.",
          })}
        </Text>
      ) : (
        <BalanceBars
          lines={model.lines}
          currency={currency}
          onMember={(member) => router.push({ pathname: MONEY_ROUTES.history, params: { member } })}
        />
      )}
      <MoneyActions
        settleLabel={
          model.plan.length === 0
            ? t({ id: 'money.settle.none', message: 'Nothing to settle' })
            : t({
                id: 'money.settle.taps',
                message: plural(taps, {
                  one: 'Settle in # tap',
                  other: 'Settle in # taps',
                }),
              })
        }
        canSettle={model.plan.length > 0}
      />
      {latest === null ? null : (
        <View style={{ gap: th.space.gap8 }}>
          <View style={[styles.latestHead, { paddingHorizontal: th.space.titleGutter }]}>
            <Text variant="label" tone="muted">
              {t({ id: 'money.latest', message: 'Latest' })}
            </Text>
            <Button
              label={t({ id: 'money.latest.all', message: 'See all' })}
              variant="control"
              size="small"
              onPress={balancesNav.history}
              testID="money-see-all"
            />
          </View>
          <View
            style={{
              marginHorizontal: th.space.gutter,
              borderRadius: th.radius.card,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
              overflow: 'hidden',
            }}
          >
            <ExpenseRow
              item={latest}
              crewCurrency={currency}
              onOpen={balancesNav.expense}
              testID="money-latest"
            />
          </View>
        </View>
      )}
    </>
  );
}

export function MoneyHomeScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const state = useBalancesScreen();
  const addLabel = t({ id: 'money.empty.add', message: 'Add an expense' });
  const actions: ShellAction[] = [
    ...(Platform.OS === 'ios'
      ? [
          {
            key: 'search',
            label: t({ id: 'money.premium.search', message: 'Every expense' }),
            sfSymbol: 'magnifyingglass' as const,
            glyph: 'more' as const,
            onPress: balancesNav.history,
            testID: 'money-search',
          },
        ]
      : []),
    {
      key: 'add',
      label: addLabel,
      sfSymbol: 'plus',
      glyph: 'plus',
      primary: true,
      onPress: balancesNav.add,
      testID: 'money-add',
    },
  ];
  const tripId = state.kind === 'ready' ? state.trip.id : null;
  return (
    <WalletGuideProvider tripId={tripId}>
      <RootScreen
        title={t({ id: 'bookings.switch.label', message: 'Wallet' })}
        actions={actions}
        testID={`money-${state.kind}`}
      >
        {({ scrollProps, largeTitle }) => (
          <ScrollView
            {...scrollProps}
            contentContainerStyle={{ paddingBottom: th.space.tabBarClearance, gap: th.space.gap16 }}
          >
            {largeTitle}
            <WalletHalfSwitchPremium current="money" />
            {state.kind === 'ready' && state.offline ? (
              <View style={{ paddingHorizontal: th.space.gap12 }}>
                <OfflinePill
                  label={t({
                    id: 'money.premium.offline',
                    message: "Offline · changes send when you're back",
                  })}
                />
              </View>
            ) : null}
            {state.kind === 'loading' ? (
              <View
                style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap12 }}
                testID="money-loading"
              >
                <Skeleton height={124} radius={th.radius.cardLarge} tone="block" />
                <Skeleton height={180} radius={th.radius.card} />
              </View>
            ) : state.kind === 'none' ? (
              <MoneyNone crew={state.crew} />
            ) : state.kind === 'syncing' ? (
              <MoneyNone crew syncing items={state.items} currency={state.currency} />
            ) : state.empty ? (
              <EmptyMoney state={state} />
            ) : (
              <Ready state={state} />
            )}
          </ScrollView>
        )}
      </RootScreen>
    </WalletGuideProvider>
  );
}

const styles = StyleSheet.create({
  tripRow: { flexDirection: 'row' },
  latestHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
