import { useLocalSearchParams } from 'expo-router';

import { tripParam } from '@/features/money/routes';
import { PaymentScreen } from '@/features/money/settle/PaymentScreen';

/** One payment: pay (QR, bank details, mark paid) or request, nudge, confirm, dispute. */
export default function PaymentRoute() {
  const { id, trip } = useLocalSearchParams<{ id: string; trip?: string }>();
  return <PaymentScreen id={typeof id === 'string' ? id : ''} tripId={tripParam(trip)} />;
}
