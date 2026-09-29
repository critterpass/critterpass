import { useLocalSearchParams } from 'expo-router';

import { PaymentScreen } from '@/features/money/settle/PaymentScreen';

/** One payment: pay (QR, bank details, mark paid) or request, nudge, confirm, dispute. */
export default function PaymentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PaymentScreen id={typeof id === 'string' ? id : ''} />;
}
