import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetailScreen } from '@/features/money/expense-detail/ExpenseDetailScreen';

/** One expense: shares, rate, edit history, edit and delete. */
export default function ExpenseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseDetailScreen expenseId={typeof id === 'string' ? id : ''} />;
}
