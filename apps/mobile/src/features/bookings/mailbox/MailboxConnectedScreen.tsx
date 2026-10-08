/**
 * Where a Gmail or Outlook sign-in comes back (`critterpass://wallet/mailbox/connected`,
 * undesigned; one line and one way on): finishes the connection with `connect_mailbox` from this
 * device, then says whether it worked. Denied or failed sign-ins say so.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { PillButton } from '@/ui/buttons/PillButton';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { connectMailboxCommand } from '../data/commands';
import { BOOKINGS_ROUTES } from '../routes';
import type { MailboxReturn } from './oauth';
import { useWalletGuide } from '../data/wallet-guide';
import { useWalletContext } from '../data/use-wallet-context';
import { WalletGuideProvider } from '../data/wallet-guide';

export type MailboxOutcome = 'connecting' | 'connected' | 'denied' | 'failed';

const useStyles = makeStyles((t) => ({
  content: {
    flex: 1,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['32'],
    gap: t.space['12'],
  },
}));

export function MailboxConnectedView({
  outcome,
  onDone,
}: {
  readonly outcome: MailboxOutcome;
  readonly onDone: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const copy: Record<MailboxOutcome, { title: string; line: string }> = {
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
  return (
    <Scaffold variant="dark" testID={`bookings-mailbox-${outcome}`}>
      <View style={styles.content}>
        <Text variant="h1" accessibilityRole="header">
          {copy[outcome].title}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {copy[outcome].line}
        </Text>
      </View>
      {/* The page sits in the Wallet tab: the footer stands above the tab bar and its guide button. */}
      <KeyboardFooter testID="bookings-mailbox-footer">
        <PillButton
          label={t({ id: 'bookings.mailboxDone.back', message: 'Back to bookings' })}
          onPress={onDone}
          disabled={outcome === 'connecting'}
          testID="bookings-mailbox-back"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}

export function MailboxConnectedScreen({ result }: { readonly result: MailboxReturn }) {
  const walletTrip = useWalletContext().trip?.id ?? null;
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
  return (
    <WalletGuideProvider tripId={walletTrip}>
      <MailboxConnectedView
        outcome={outcome}
        onDone={() => router.dismissTo(BOOKINGS_ROUTES.wallet)}
      />
    </WalletGuideProvider>
  );
}
