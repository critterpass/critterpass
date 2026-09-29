/** The expense history of the trip Money shows, from synced rows plus the offline queue. */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { MoneyLoading } from '../balances/BalancesScreen';
import { expenseItems, filterItems, type ExpenseFilter } from '../data/expense-items';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { expenseRoute } from '../routes';
import { HistoryView } from './HistoryView';

export function HistoryScreen() {
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const [filter, setFilter] = useState<ExpenseFilter>({ memberId: null, category: null });
  const currency = ctx.crew?.settlementCurrency ?? 'USD';
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
  if (ctx.status === 'loading' || !rows.loaded) return <MoneyLoading />;
  return (
    <HistoryView
      items={filterItems(items, filter)}
      members={ctx.members.filter((member) =>
        items.some(
          (item) => item.inSplit.includes(member.userId) || item.payerId === member.userId,
        ),
      )}
      crewCurrency={currency}
      filter={filter}
      onFilter={setFilter}
      onExpense={(id) => router.push(expenseRoute(id))}
    />
  );
}
