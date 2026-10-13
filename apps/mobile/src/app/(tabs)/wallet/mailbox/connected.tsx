import { useLocalSearchParams } from 'expo-router';

import { MailboxConnectedScreen, parseMailboxReturn } from '@/features/bookings';
import { MailboxConnectedPremium } from '@/features/bookings/premium/MailboxConnectedPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Where a mailbox sign-in returns (`critterpass://wallet/mailbox/connected`). */
export default function MailboxConnectedRoute() {
  const result = parseMailboxReturn(useLocalSearchParams());
  return usePremiumUi() ? (
    <MailboxConnectedPremium result={result} />
  ) : (
    <MailboxConnectedScreen result={result} />
  );
}
