/** The mailbox sheet with its actions: sign in with the provider, or disconnect. */
import { MailboxSheet } from '../mailbox/MailboxSheet';
import type { MailboxStatus } from '../mailbox/use-mailbox';
import { useMailboxActions } from './use-mailbox-actions';

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
  const mailbox = useMailboxActions(status, onChanged);
  return (
    <MailboxSheet
      status={status}
      address={address}
      surfaceToCrew={mailbox.surface}
      busy={mailbox.busy}
      error={mailbox.error}
      onPaywall={mailbox.paywall}
      onSurface={mailbox.setSurface}
      onConnect={mailbox.connect}
      onDisconnect={mailbox.disconnect}
      onCopy={mailbox.copy}
      onClose={onClose}
    />
  );
}
