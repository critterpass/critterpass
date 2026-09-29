import { useLocalSearchParams } from 'expo-router';

import { AddExpenseScreen } from '@/features/money/add-expense/AddExpenseScreen';

/** Add an expense on the keypad (3i-2); `?edit={id}` edits one instead. */
export default function AddExpenseRoute() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  return <AddExpenseScreen editId={typeof edit === 'string' && edit !== '' ? edit : null} />;
}
