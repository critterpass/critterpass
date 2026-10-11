/** The mailbox sheet's actions for any view: sign in with the provider, or disconnect. */
import type { MailboxProvider } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { disconnectMailboxCommand } from '../data/commands';
import { useBookingsServices } from '../data/services';
import { mailboxPaywall } from '../mailbox/mailbox-slot';
import { installDeviceId, startMailboxOAuth } from '../mailbox/oauth';
import type { MailboxStatus } from '../mailbox/use-mailbox';

export function useMailboxActions(status: MailboxStatus, onChanged: () => void) {
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
  return {
    busy: busy || disconnect.pending,
    error,
    paywall,
    /** Whether a connected mailbox's finds are shown to the crew. */
    surface,
    setSurface,
    connect: (provider: MailboxProvider) => void connect(provider),
    disconnect: () => {
      if (status.kind !== 'connected') return;
      void disconnect.send({ connection_id: status.connection.connection_id }).then((result) => {
        if (result.kind === 'applied') onChanged();
        else setError(true);
      });
    },
    copy: (text: string) => services.copy(text),
  };
}
