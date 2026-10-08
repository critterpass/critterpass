import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetailScreen } from '@/features/money/expense-detail/ExpenseDetailScreen';
import { tripParam } from '@/features/money/routes';

/** One expense: shares, rate, edit history, edit and delete; `?trip={id}` names its trip. */
export default function ExpenseRoute() {
  const { id, trip } = useLocalSearchParams<{ id: string; trip?: string }>();
  return (
    <ExpenseDetailScreen expenseId={typeof id === 'string' ? id : ''} tripId={tripParam(trip)} />
  );
}
