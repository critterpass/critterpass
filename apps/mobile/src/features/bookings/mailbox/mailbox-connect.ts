/**
 * Where a Gmail or Outlook sign-in comes back: finishes the connection with `connect_mailbox` from
 * this device, and what the page says for each outcome. Denied or failed sign-ins say so.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { connectMailboxCommand } from '../data/commands';
import { useWalletGuide } from '../data/wallet-guide';
import type { MailboxReturn } from './oauth';

export type MailboxOutcome = 'connecting' | 'connected' | 'denied' | 'failed';

/** What the return page says for each outcome. */
export function useMailboxOutcomeCopy(): Record<MailboxOutcome, { title: string; line: string }> {
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  return {
    connecting: {
      title: t({ id: 'bookings.mailboxDone.connectingTitle', message: 'Connecting…' }),
      line: t({
        id: 'bookings.mailboxDone.connectingLine',
        message: `${guideName} is setting up the morning check.`,
      }),
    },
    connected: {
      title: t({ id: 'bookings.mailboxDone.doneTitle', message: 'Mailbox connected' }),
      line: t({
        id: 'bookings.mailboxDone.doneLine',
        message:
          'I check for new confirmations every morning. You can switch that off in Settings.',
      }),
    },
    denied: {
      title: t({ id: 'bookings.mailboxDone.deniedTitle', message: 'Not connected' }),
      line: t({
        id: 'bookings.mailboxDone.deniedLine',
        message: 'No access was given. Forwarding still works.',
      }),
    },
    failed: {
      title: t({ id: 'bookings.mailboxDone.failedTitle', message: 'That didn’t work' }),
      line: t({
        id: 'bookings.mailboxDone.failedLine',
        message: 'Try connecting again from Add a booking.',
      }),
    },
  };
}

/** Finishes a sign-in that came back authorised; says how it went. */
export function useMailboxConnect(result: MailboxReturn): MailboxOutcome {
  const { send } = useCommand(connectMailboxCommand);
  const [outcome, setOutcome] = useState<MailboxOutcome>(
    result.kind === 'authorized' ? 'connecting' : result.kind,
  );
  const started = useRef(false);
  useEffect(() => {
    if (result.kind !== 'authorized' || started.current) return;
    started.current = true;
    void send({ provider: result.provider, auth_code: result.code, state: result.state }).then(
      (sent) => setOutcome(sent.kind === 'applied' ? 'connected' : 'failed'),
      () => setOutcome('failed'),
    );
  }, [result, send]);
  return outcome;
}
