import { useLocalSearchParams } from 'expo-router';

import { parseMailboxReturn } from '@/features/bookings';
import { MailboxConnectedPremium } from '@/features/bookings/premium/MailboxConnectedPremium';

/** Where a mailbox sign-in returns (`critterpass://wallet/mailbox/connected`). */
export default function MailboxConnectedRoute() {
  return <MailboxConnectedPremium result={parseMailboxReturn(useLocalSearchParams())} />;
}
