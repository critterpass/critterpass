import { useLocalSearchParams } from 'expo-router';

import { AddExpenseScreen } from '@/features/money/add-expense/AddExpenseScreen';
import { tripParam } from '@/features/money/routes';

/**
 * Add an expense on the keypad (3i-2); `?edit={id}` edits one, `?name=` starts it named and
 * `?trip={id}` (or `?tripId={id}`) adds it to that trip instead of the one Balances shows.
 */
export default function AddExpenseRoute() {
  const { edit, name, trip, tripId } = useLocalSearchParams<{
    edit?: string;
    name?: string;
    trip?: string;
    tripId?: string;
  }>();
  return (
    <AddExpenseScreen
      editId={typeof edit === 'string' && edit !== '' ? edit : null}
      prefillName={typeof name === 'string' && name !== '' ? name : null}
      tripId={tripParam(trip, tripId)}
    />
  );
}
