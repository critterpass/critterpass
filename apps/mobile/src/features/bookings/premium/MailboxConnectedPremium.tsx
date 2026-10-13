/**
 * Where a Gmail or Outlook sign-in comes back (undesigned, logged in docs/undesigned-states.md): a
 * pushed page with the glass back, the guide's sticker, one line on how it went (the check pops in
 * once connected) and "Back to bookings". Connecting holds the button until it is done.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { guideCritterKind } from '@/features/trip';
import { Button, EmptyState, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useWalletContext } from '../data/use-wallet-context';
import { useWalletGuide, WalletGuideProvider } from '../data/wallet-guide';
import {
  useMailboxConnect,
  useMailboxOutcomeCopy,
  type MailboxOutcome,
} from '../mailbox/mailbox-connect';
import type { MailboxReturn } from '../mailbox/oauth';
import { BOOKINGS_ROUTES } from '../routes';

function Outcome({ outcome }: { readonly outcome: MailboxOutcome }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const copy = useMailboxOutcomeCopy()[outcome];
  return (
    <PushScreen
      title={t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' })}
      backLabel={t({ id: 'bookings.back', message: 'Bookings' })}
      testID={`bookings-mailbox-${outcome}`}
    >
      <View style={{ paddingTop: th.space.gap16 }}>
        <EmptyState
          title={copy.title}
          line={copy.line}
          critter={{ kind: guideCritterKind(guide.id), name: guide.name }}
          check={outcome === 'connected'}
          action={
            <Button
              label={t({ id: 'bookings.mailboxDone.back', message: 'Back to bookings' })}
              onPress={() => router.dismissTo(BOOKINGS_ROUTES.wallet)}
              loading={outcome === 'connecting'}
              testID="bookings-mailbox-back"
            />
          }
        />
      </View>
    </PushScreen>
  );
}

export function MailboxConnectedPremium({ result }: { readonly result: MailboxReturn }) {
  const walletTrip = useWalletContext().trip?.id ?? null;
  const outcome = useMailboxConnect(result);
  return (
    <WalletGuideProvider tripId={walletTrip}>
      <Outcome outcome={outcome} />
    </WalletGuideProvider>
  );
}
