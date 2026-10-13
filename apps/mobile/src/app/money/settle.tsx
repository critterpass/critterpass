import { useLocalSearchParams } from 'expo-router';

import { SettlePremium } from '@/features/money/premium/SettlePremium';
import { tripParam } from '@/features/money/routes';

/** Settle up (3i-5, 7.24, 7.28): the netted payments, how people pay you and the Settled Tokek. */
export default function SettleRoute() {
  const { trip, tripId } = useLocalSearchParams<{ trip?: string; tripId?: string }>();
  return <SettlePremium tripId={tripParam(trip, tripId)} />;
}
