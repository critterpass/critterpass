/**
 * Money home (the Wallet tab's MONEY half): the crew and trip from synced rows, the balances from
 * the trip's ledger through the engine, and the latest expense (queued ones included, marked
 * pending). Renders offline; a crew without a trip, or no crew at all, gets its own invitation.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { guideSticker } from '@/ui/avatar/guides';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { expenseItems } from '../data/expense-items';
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

export function BalancesScreen() {
  const selected = useSelectedTrip();
  useReceiptQueueDrain(useMoneyServices());
  const ctx = useMoneyContext(selected);
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const sync = useSyncStatus();
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
          offline={sync.phase === 'offline'}
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
