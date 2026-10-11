import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetailScreen } from '@/features/money/expense-detail/ExpenseDetailScreen';
import { ExpenseDetailPremium } from '@/features/money/premium/ExpenseDetailPremium';
import { tripParam } from '@/features/money/routes';
import { usePremiumUi } from '@/lib/premium-ui';

/** One expense (7.21): shares, rate, edit history, edit and delete; `?trip={id}` names its trip. */
export default function ExpenseRoute() {
  const { id, trip } = useLocalSearchParams<{ id: string; trip?: string }>();
  const premium = usePremiumUi();
  const expenseId = typeof id === 'string' ? id : '';
  return premium ? (
    <ExpenseDetailPremium expenseId={expenseId} tripId={tripParam(trip)} />
  ) : (
    <ExpenseDetailScreen expenseId={expenseId} tripId={tripParam(trip)} />
  );
}
