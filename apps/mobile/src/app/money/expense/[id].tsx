import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetailPremium } from '@/features/money/premium/ExpenseDetailPremium';
import { tripParam } from '@/features/money/routes';

/** One expense (7.21): shares, rate, edit history, edit and delete; `?trip={id}` names its trip. */
export default function ExpenseRoute() {
  const { id, trip } = useLocalSearchParams<{ id: string; trip?: string }>();
  return (
    <ExpenseDetailPremium expenseId={typeof id === 'string' ? id : ''} tripId={tripParam(trip)} />
  );
}
