import { useLocalSearchParams } from 'expo-router';

import { MailboxConnectedScreen, parseMailboxReturn } from '@/features/bookings';

/** Where a mailbox sign-in returns (`critterpass://wallet/mailbox/connected`). */
export default function MailboxConnectedRoute() {
  return <MailboxConnectedScreen result={parseMailboxReturn(useLocalSearchParams())} />;
}
