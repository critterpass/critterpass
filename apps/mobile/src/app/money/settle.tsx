import { useLocalSearchParams } from 'expo-router';

import { tripParam } from '@/features/money/routes';
import { SettleScreen } from '@/features/money/settle/SettleScreen';

/** Settle up (3i-5): the netted payments, how people pay you and the Settled Tokek. */
export default function SettleRoute() {
  const { trip, tripId } = useLocalSearchParams<{ trip?: string; tripId?: string }>();
  return <SettleScreen tripId={tripParam(trip, tripId)} />;
}
