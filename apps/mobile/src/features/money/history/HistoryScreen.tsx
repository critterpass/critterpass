/**
 * The expense history of the trip Money shows, from synced rows plus the offline queue. The list is
 * built once per change of the rows; the filters only pick from it.
 */
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
import { expenseItems, filterItems, type ExpenseFilter } from '../data/expense-items';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { expenseRoute, MONEY_ROUTES } from '../routes';
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
  const shown = useMemo(() => filterItems(items, filter), [items, filter]);
  const members = useMemo(
    () =>
      ctx.members.filter((member) =>
        items.some(
          (item) => item.inSplit.includes(member.userId) || item.payerId === member.userId,
        ),
      ),
    [ctx.members, items],
  );
  const onExpense = useCallback((id: string) => router.push(expenseRoute(id)), []);
  const onAdd = useCallback(() => router.push(MONEY_ROUTES.add), []);
  if (ctx.status === 'loading' || (ctx.status === 'ready' && !rows.loaded)) {
    return <MoneyScreenLoading />;
  }
  if (ctx.trip === null) return <MoneyNoTripScreen crew={ctx.crew !== null} />;
  return (
    <HistoryView
      items={shown}
      total={items.length}
      members={members}
      crewCurrency={currency}
      filter={filter}
      onFilter={setFilter}
      onExpense={onExpense}
      onAdd={onAdd}
    />
  );
}
