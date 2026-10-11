/**
 * The expense history of the trip Money shows (its data is `useHistory`).
 */
import { MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
import { HistoryView } from './HistoryView';
import { useHistory } from './use-history';

export function HistoryScreen() {
  const history = useHistory();
  if (history.loading) return <MoneyScreenLoading />;
  if (history.noTrip) return <MoneyNoTripScreen crew={history.hasCrew} />;
  return (
    <HistoryView
      items={history.shown}
      total={history.items.length}
      members={history.members}
      crewCurrency={history.currency}
      filter={history.filter}
      onFilter={history.setFilter}
      onExpense={history.onExpense}
      onAdd={history.onAdd}
    />
  );
}
