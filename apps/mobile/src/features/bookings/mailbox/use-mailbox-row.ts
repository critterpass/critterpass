/**
 * The Settings row for the mailbox (3n-2 "Find bookings in my email"), for the Settings screen to
 * render: its subtitle follows the connection ("Read-only, confirmations only · Gmail", "Coming
 * soon — forward confirmations meanwhile", Pass+), and it opens the connect sheet on Add a booking.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useWalletContext } from '../data/use-wallet-context';
import { BOOKINGS_ROUTES } from '../routes';
import { useMailbox } from './use-mailbox';

export interface MailboxSettingsRow {
  readonly title: string;
  readonly subtitle: string;
  readonly onPress: () => void;
}

export function useMailboxSettingsRow(): MailboxSettingsRow {
  const { t } = useLingui();
  const context = useWalletContext();
  const { status } = useMailbox(context.passPlus);
  const provider =
    status.kind !== 'connected'
      ? ''
      : status.connection.provider === 'gmail'
        ? t({ id: 'bookings.mailbox.gmail', message: 'Gmail' })
        : t({ id: 'bookings.mailbox.outlook', message: 'Outlook' });
  const subtitle =
    status.kind === 'connected'
      ? t({
          id: 'bookings.mailboxRow.connected',
          message: `Read-only, confirmations only · ${provider}`,
        })
      : status.kind === 'soon'
        ? t({
            id: 'bookings.mailbox.soon',
            message: 'Coming soon — forward confirmations meanwhile.',
          })
        : status.kind === 'locked'
          ? t({ id: 'bookings.mailboxRow.locked', message: 'With Pass+' })
          : t({ id: 'bookings.mailboxRow.off', message: 'Not connected' });
  return {
    title: t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' }),
    subtitle,
    onPress: () => router.push({ pathname: BOOKINGS_ROUTES.add, params: { start: 'mailbox' } }),
  };
}
