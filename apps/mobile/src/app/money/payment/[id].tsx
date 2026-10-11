import { useLocalSearchParams } from 'expo-router';

import { PaymentPremium } from '@/features/money/premium/PaymentPremium';
import { tripParam } from '@/features/money/routes';
import { PaymentScreen } from '@/features/money/settle/PaymentScreen';
import { usePremiumUi } from '@/lib/premium-ui';

/** One payment (7.25, 7.26): pay (QR, bank details, mark paid) or request, nudge, confirm, dispute. */
export default function PaymentRoute() {
  const { id, trip } = useLocalSearchParams<{ id: string; trip?: string }>();
  const premium = usePremiumUi();
  const paymentId = typeof id === 'string' ? id : '';
  return premium ? (
    <PaymentPremium id={paymentId} tripId={tripParam(trip)} />
  ) : (
    <PaymentScreen id={paymentId} tripId={tripParam(trip)} />
  );
}
