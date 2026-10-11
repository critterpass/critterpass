/**
 * Money home (the Wallet tab's MONEY half): the crew and trip from synced rows, the balances from
 * the trip's ledger through the engine, and the latest expense (queued ones included, marked
 * pending). Renders offline; a crew without a trip, or no crew at all, gets its own invitation. A
 * ledger that does not add up yet (its rows are still arriving) waits on the skeleton for a moment,
 * then says the balances are still syncing and lists the expenses it has.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Stack } from '@/ui/layout/Stack';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { ExpenseListRow } from '../components/ExpenseListRow';
import type { ExpenseItem } from '../data/expense-items';
import { selectTrip } from '../data/selected-trip';
import { BalancesView } from './BalancesView';
import { CurrencySheet } from './CurrencySheet';
import { tripLabel, TripSheet } from './TripSheet';
import { balancesNav, useBalancesScreen } from './use-balances-screen';
import { WalletGuideProvider } from '@/features/bookings';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['16'] },
}));

export function MoneyLoading() {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <Scaffold variant="dark" testID="money-loading">
      <View style={styles.content}>
        <Skeleton preset="lines" label={t({ id: 'money.loading', message: 'Loading the money' })} />
        <Skeleton preset="card" />
        <Skeleton preset="card" />
      </View>
    </Scaffold>
  );
}

export function MoneyNoTrip({ crew }: { readonly crew: boolean }) {
  const styles = useStyles();
  const inset = useTabBarInset();
  const { t } = useLingui();
  return (
    <Scaffold variant="dark" testID={crew ? 'money-no-trip' : 'money-no-crew'}>
      <View style={[styles.content, { paddingBottom: inset }]}>
        <EmptyState
          guide="tokek"
          guideName={guideSticker('tokek').name}
          title={
            crew
              ? t({ id: 'money.noTrip.title', message: 'No trip to split yet' })
              : t({ id: 'money.noCrew.title', message: 'Money is for crews' })
          }
          line={
            crew
              ? t({
                  id: 'money.noTrip.line',
                  message:
                    'Once the crew has a trip, every expense lands here and I keep the tally.',
                })
              : t({
                  id: 'money.noCrew.line',
                  message: 'Start or join a crew and I will split every bill with them.',
                })
          }
        />
      </View>
    </Scaffold>
  );
}

/** How many expenses the syncing state lists; the history has the rest. */
const SYNCING_ROWS = 5;

/**
 * The trip's rows are here but its ledger does not add up yet (undesigned; the empty state over
 * the expense rows): no totals are shown until they are right, the expenses already synced are.
 */
function MoneySyncing({
  items,
  currency,
  onExpense,
  onHistory,
}: {
  readonly items: readonly ExpenseItem[];
  readonly currency: string;
  readonly onExpense: (id: string) => void;
  readonly onHistory: () => void;
}) {
  const styles = useStyles();
  const inset = useTabBarInset();
  const { t } = useLingui();
  return (
    <Scaffold variant="dark" testID="money-syncing">
      <View style={[styles.content, { paddingBottom: inset }]}>
        <EmptyState
          guide="tokek"
          guideName={guideSticker('tokek').name}
          title={t({ id: 'money.syncing.title', message: 'Still syncing the balances' })}
          line={t({
            id: 'money.syncing.line',
            message: 'The totals show once every expense is in. Here is what I have so far.',
          })}
          {...(items.length > SYNCING_ROWS
            ? {
                action: {
                  label: t({ id: 'money.latest.all', message: 'See all' }),
                  onPress: onHistory,
                },
              }
            : {})}
        />
        <Stack gap="4">
          {items.slice(0, SYNCING_ROWS).map((item) => (
            <ExpenseListRow key={item.id} item={item} crewCurrency={currency} onOpen={onExpense} />
          ))}
        </Stack>
      </View>
    </Scaffold>
  );
}

export function BalancesScreen() {
  const state = useBalancesScreen();
  const { t } = useLingui();
  const [sheet, setSheet] = useState<'currency' | 'trip' | null>(null);

  if (state.kind === 'syncing') {
    return (
      <MoneySyncing
        items={state.items}
        currency={state.currency}
        onExpense={balancesNav.expense}
        onHistory={balancesNav.history}
      />
    );
  }
  if (state.kind === 'loading') return <MoneyLoading />;
  if (state.kind === 'none') return <MoneyNoTrip crew={state.crew} />;
  const { ctx, crew, trip, model, items, currency, choices } = state;
  const fallbackTrip = t({ id: 'money.trips.unnamed', message: 'Trip' });
  return (
    <WalletGuideProvider tripId={trip.id}>
      <>
        <BalancesView
          currency={currency}
          totalSpentMinor={model.totalSpentMinor}
          hero={model.hero}
          lines={model.lines}
          settleTaps={model.plan.length}
          latest={items[0] ?? null}
          empty={state.empty}
          solo={state.solo}
          offline={state.offline}
          tripLabel={ctx.trips.length > 1 ? tripLabel(trip, fallbackTrip) : null}
          onTrip={() => setSheet('trip')}
          onCurrency={() => setSheet('currency')}
          onSettle={balancesNav.settle}
          onScan={balancesNav.scan}
          onAdd={balancesNav.add}
          onBudget={balancesNav.budget}
          onHistory={balancesNav.history}
          onExpense={balancesNav.expense}
        />
        {sheet === 'currency' ? (
          <CurrencySheet
            crewId={crew.id}
            current={currency}
            choices={choices}
            organiser={crew.organiser || trip.organiser}
            onClose={() => setSheet(null)}
          />
        ) : null}
        {sheet === 'trip' ? (
          <TripSheet
            trips={ctx.trips}
            current={trip.id}
            onPick={(id) => {
              selectTrip(id);
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
        ) : null}
      </>
    </WalletGuideProvider>
  );
}
