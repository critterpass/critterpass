/**
 * The invite (6g-2): asks the server for his one-time link (online only), prefills the message in
 * English (Bahasa below when asked) and opens WhatsApp with it. The member presses send; we never
 * send for them.
 */
import { router } from 'expo-router';

import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { InviteView } from './InviteView';
import { useInvite } from './use-invite';

export function InviteScreen({
  tripId,
  providerId,
}: {
  readonly tripId: string;
  readonly providerId: string;
}) {
  const invite = useInvite(tripId, providerId);
  if (invite.driver === null) return <SessionWaiting testID="drivers-invite-loading" />;
  return (
    <InviteView
      name={invite.name}
      message={invite.message}
      withBahasa={invite.withBahasa}
      expiresOn={invite.expiresOn}
      error={invite.error}
      onBack={() => router.back()}
      onMessage={invite.setMessage}
      onBahasa={invite.setBahasa}
      onOpenWhatsApp={invite.openWhatsApp}
    />
  );
}
