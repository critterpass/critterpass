import { useLocalSearchParams } from 'expo-router';

import { PaymentPremium } from '@/features/money/premium/PaymentPremium';
import { tripParam } from '@/features/money/routes';

/** One payment (7.25, 7.26): pay (QR, bank details, mark paid) or request, nudge, confirm, dispute. */
export default function PaymentRoute() {
  const { id, trip } = useLocalSearchParams<{ id: string; trip?: string }>();
  return <PaymentPremium id={typeof id === 'string' ? id : ''} tripId={tripParam(trip)} />;
}
