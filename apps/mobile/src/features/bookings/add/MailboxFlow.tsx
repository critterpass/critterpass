/** The mailbox sheet with its actions: sign in with the provider, or disconnect. */
import type { MailboxProvider } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { disconnectMailboxCommand } from '../data/commands';
import { useBookingsServices } from '../data/services';
import { MailboxSheet } from '../mailbox/MailboxSheet';
import { mailboxPaywall } from '../mailbox/mailbox-slot';
import { installDeviceId, startMailboxOAuth } from '../mailbox/oauth';
import type { MailboxStatus } from '../mailbox/use-mailbox';

export function MailboxFlow({
  status,
  address,
  onChanged,
  onClose,
}: {
  readonly status: MailboxStatus;
  readonly address: string | null;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}) {
  const services = useBookingsServices();
  const disconnect = useCommand(disconnectMailboxCommand);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [surface, setSurface] = useState(false);
  const paywall = mailboxPaywall();
  const connect = async (provider: MailboxProvider) => {
    setBusy(true);
    setError(false);
    const started = await startMailboxOAuth(services, provider, await installDeviceId());
    setBusy(false);
    if (started.kind === 'failed') setError(true);
  };
  return (
    <MailboxSheet
      status={status}
      address={address}
      surfaceToCrew={surface}
      busy={busy || disconnect.pending}
      error={error}
      onPaywall={paywall}
      onSurface={setSurface}
      onConnect={(provider) => void connect(provider)}
      onDisconnect={() => {
        if (status.kind !== 'connected') return;
        void disconnect.send({ connection_id: status.connection.connection_id }).then((result) => {
          if (result.kind === 'applied') onChanged();
          else setError(true);
        });
      }}
      onCopy={(text) => services.copy(text)}
      onClose={onClose}
    />
  );
}
