import { useLocalSearchParams } from 'expo-router';

import { AddExpenseScreen } from '@/features/money/add-expense/AddExpenseScreen';

/** Add an expense on the keypad (3i-2); `?edit={id}` edits one, `?name=` starts it named. */
export default function AddExpenseRoute() {
  const { edit, name } = useLocalSearchParams<{ edit?: string; name?: string }>();
  return (
    <AddExpenseScreen
      editId={typeof edit === 'string' && edit !== '' ? edit : null}
      prefillName={typeof name === 'string' && name !== '' ? name : null}
    />
  );
}
