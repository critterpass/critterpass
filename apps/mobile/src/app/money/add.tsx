import { useLocalSearchParams } from 'expo-router';

import { AddExpenseScreen } from '@/features/money/add-expense/AddExpenseScreen';
import { AddExpensePremium } from '@/features/money/premium/AddExpensePremium';
import { tripParam } from '@/features/money/routes';
import { usePremiumUi } from '@/lib/premium-ui';

/**
 * Add an expense on the keypad (3i-2, 7.18); `?edit={id}` edits one, `?name=` starts it named and
 * `?trip={id}` (or `?tripId={id}`) adds it to that trip instead of the one Balances shows.
 */
export default function AddExpenseRoute() {
  const { edit, name, trip, tripId } = useLocalSearchParams<{
    edit?: string;
    name?: string;
    trip?: string;
    tripId?: string;
  }>();
  const premium = usePremiumUi();
  const editId = typeof edit === 'string' && edit !== '' ? edit : null;
  const prefillName = typeof name === 'string' && name !== '' ? name : null;
  const forTrip = tripParam(trip, tripId);
  return premium ? (
    <AddExpensePremium editId={editId} prefillName={prefillName} tripId={forTrip} />
  ) : (
    <AddExpenseScreen editId={editId} prefillName={prefillName} tripId={forTrip} />
  );
}
