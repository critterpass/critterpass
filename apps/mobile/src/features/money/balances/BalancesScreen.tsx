/**
 * Money home (the Wallet tab's MONEY half): the crew and trip from synced rows, the balances from
 * the trip's ledger through the engine, and the latest expense (queued ones included, marked
 * pending). Renders offline; a crew without a trip, or no crew at all, gets its own invitation. A
 * ledger that does not add up yet (its rows are still arriving) waits on the skeleton for a moment,
 * then says the balances are still syncing and lists the expenses it has.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useSyncPhase } from '@/data/status/use-sync-status';
import { guideSticker } from '@/ui/avatar/guides';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Stack } from '@/ui/layout/Stack';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { ExpenseListRow } from '../components/ExpenseListRow';
import { expenseItems, type ExpenseItem } from '../data/expense-items';
import { useMoneyServices } from '../data/services';
import { useReceiptQueueDrain } from '../receipt/receipt-queue';
import { selectTrip, useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { expenseRoute, MONEY_ROUTES } from '../routes';
import { BalancesView } from './BalancesView';
import { CurrencySheet } from './CurrencySheet';
import { buildBalances, isSolo } from './model';
import { tripLabel, TripSheet } from './TripSheet';
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

/** How long a ledger that does not net to zero waits on the skeleton before saying so. */
const SYNCING_AFTER_MS = 4000;
/** How many expenses the syncing state lists; the history has the rest. */
const SYNCING_ROWS = 5;

/** True once `active` has held for `ms` without a break. */
function useHeldFor(active: boolean, ms: number): boolean {
  // One token per stretch of `active`: a timer that fired for an earlier stretch counts for nothing.
  const stretch = useMemo(() => ({ active }), [active]);
  const [held, setHeld] = useState<object | null>(null);
  useEffect(() => {
    if (!stretch.active) return undefined;
    const timer = setTimeout(() => setHeld(stretch), ms);
    return () => clearTimeout(timer);
  }, [stretch, ms]);
  return active && held === stretch;
}

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
  const selected = useSelectedTrip();
  useReceiptQueueDrain(useMoneyServices());
  const ctx = useMoneyContext(selected);
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const syncPhase = useSyncPhase();
  const { t } = useLingui();
  const [sheet, setSheet] = useState<'currency' | 'trip' | null>(null);
  const currency = ctx.crew?.settlementCurrency ?? 'USD';

  const model = useMemo(() => {
    if (ctx.uid === null || ctx.trip === null) return null;
    try {
      return buildBalances({
        uid: ctx.uid,
        members: ctx.members,
        shown: ctx.splitMembers,
        ledger: rows.ledger,
        payments: rows.payments,
        expenses: rows.expenses,
        currency,
      });
    } catch {
      // A ledger mid-sync that does not net to zero yet: wait for the next checkpoint.
      return null;
    }
  }, [ctx, rows, currency]);

  const items = useMemo(
    () =>
      ctx.trip === null
        ? []
        : expenseItems({
            expenses: rows.expenses,
            shares: rows.shares,
            pending: rows.pending,
            members: ctx.members,
            tripId: ctx.trip.id,
            tz: ctx.trip.tz,
            crewCurrency: currency,
          }),
    [ctx.trip, ctx.members, rows, currency],
  );
  // Every row is read and the ledger still does not net to zero.
  const unbalancedFor = useHeldFor(
    ctx.status === 'ready' && rows.loaded && model === null,
    SYNCING_AFTER_MS,
  );

  if (unbalancedFor) {
    return (
      <MoneySyncing
        items={items}
        currency={currency}
        onExpense={(id) => router.push(expenseRoute(id))}
        onHistory={() => router.push(MONEY_ROUTES.history)}
      />
    );
  }
  if (ctx.status === 'loading' || (ctx.status === 'ready' && (!rows.loaded || model === null))) {
    return <MoneyLoading />;
  }
  if (ctx.status !== 'ready' || model === null || ctx.crew === null || ctx.trip === null) {
    return <MoneyNoTrip crew={ctx.status === 'no_trip'} />;
  }
  const crew = ctx.crew;
  const trip = ctx.trip;
  const choices = [
    ...new Set(
      [currency, trip.localCurrency, ctx.homeCurrency].filter(
        (value): value is string => value !== null,
      ),
    ),
  ];
  const fallbackTrip = t({ id: 'money.trips.unnamed', message: 'Trip' });
  return (
    <WalletGuideProvider tripId={ctx.trip?.id ?? null}>
      <>
        <BalancesView
          currency={currency}
          totalSpentMinor={model.totalSpentMinor}
          hero={model.hero}
          lines={model.lines}
          settleTaps={model.plan.length}
          latest={items[0] ?? null}
          empty={items.length === 0 && rows.ledger.length === 0}
          solo={isSolo(ctx.uid ?? '', ctx.members, model.lines)}
          offline={syncPhase === 'offline'}
          tripLabel={ctx.trips.length > 1 ? tripLabel(trip, fallbackTrip) : null}
          onTrip={() => setSheet('trip')}
          onCurrency={() => setSheet('currency')}
          onSettle={() => router.push(MONEY_ROUTES.settle)}
          onScan={() => router.push(MONEY_ROUTES.scan)}
          onAdd={() => router.push(MONEY_ROUTES.add)}
          onBudget={() => router.push(MONEY_ROUTES.budget)}
          onHistory={() => router.push(MONEY_ROUTES.history)}
          onExpense={(id) => router.push(expenseRoute(id))}
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
