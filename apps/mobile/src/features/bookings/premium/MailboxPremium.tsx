/**
 * Find bookings in my email (7.05), as a sheet with a grabber: the title with the chat doodle, the
 * promise (read-only, confirmations only), one card per provider, "Show finds to the crew" and
 * Disconnect, with the Pass+ badge under them. Connected, the provider's card wears the mint ring;
 * a provider not offered yet fades and points at forwarding, and with none offered the crew's
 * forward address sits under them. Without Pass+ the badge opens Pass+.
 */
import type { MailboxProvider } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Doodle } from '@/features/explore';
import { Button, Text, TextButton, Toggle, usePremiumTheme } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { useMailboxActions } from '../add/use-mailbox-actions';
import { useWalletGuide } from '../data/wallet-guide';
import { clock } from '../format';
import type { MailboxStatus } from '../mailbox/use-mailbox';
import { MailboxProviderCard } from './components/MailboxProviderCard';
import { MailboxPassBadge, MailboxSheetFrame } from './components/MailboxSheetFrame';

const PROVIDERS: readonly MailboxProvider[] = ['gmail', 'microsoft'];

export function MailboxPremium(props: {
  readonly status: MailboxStatus;
  readonly address: string | null;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const { name: guideName } = useWalletGuide();
  const mailbox = useMailboxActions(props.status, props.onChanged);
  const { status } = props;
  const providerName = (provider: MailboxProvider) =>
    provider === 'gmail'
      ? t({ id: 'bookings.mailbox.gmail', message: 'Gmail' })
      : t({ id: 'bookings.mailbox.outlook', message: 'Outlook' });
  const offered: readonly MailboxProvider[] =
    status.kind === 'choose' ? status.providers : status.kind === 'locked' ? PROVIDERS : [];
  const connected = status.kind === 'connected' ? status.connection : null;
  const soonLine = t({
    id: 'bookings.premium.mailboxSoon',
    message: 'Coming soon. Forward confirmations meanwhile.',
  });
  const disconnect = () =>
    void confirmAlert({
      title: t({ id: 'bookings.premium.disconnectTitle', message: 'Stop checking your email?' }),
      message: t({
        id: 'bookings.premium.disconnectLine',
        message: 'Bookings already found stay in the wallet.',
      }),
      confirm: t({ id: 'bookings.mailbox.disconnect', message: 'Disconnect' }),
      cancel: t({ id: 'bookings.options.cancel', message: 'Cancel' }),
    }).then((yes) => {
      if (yes) mailbox.disconnect();
    });
  const card = (provider: MailboxProvider) => {
    const name = providerName(provider);
    if (connected?.provider === provider) {
      const checked = clock(i18n.locale, connected.last_scan_at);
      return (
        <MailboxProviderCard
          key={provider}
          provider={provider}
          state="connected"
          title={t({ id: 'bookings.mailbox.connected', message: `Connected · ${name}` })}
          sub={
            checked === ''
              ? t({
                  id: 'bookings.premium.mailboxWaiting',
                  message: 'First check tomorrow morning',
                })
              : t({ id: 'bookings.premium.mailboxChecked', message: `Checked ${checked}` })
          }
          testID="bookings-mailbox-connected"
        />
      );
    }
    // One mailbox at a time: once connected, the other offered provider steps aside.
    if (connected !== null && offered.includes(provider)) return null;
    if (status.kind === 'choose' && offered.includes(provider)) {
      return (
        <MailboxProviderCard
          key={provider}
          provider={provider}
          state="offered"
          title={name}
          sub={t({ id: 'bookings.premium.mailboxReadOnly', message: 'Read-only sign-in' })}
          onPress={() => mailbox.connect(provider)}
          trailing={
            <Button
              label={t({ id: 'bookings.premium.connect', message: 'Connect' })}
              size="small"
              loading={mailbox.busy}
              onPress={() => mailbox.connect(provider)}
              testID={`bookings-mailbox-connect-${provider}`}
            />
          }
          testID={`bookings-mailbox-provider-${provider}`}
        />
      );
    }
    if (status.kind === 'locked') {
      return (
        <MailboxProviderCard
          key={provider}
          provider={provider}
          state="offered"
          title={name}
          sub={t({
            id: 'bookings.mailbox.lockedLine',
            message: `${guideName} checks your inbox for new confirmations every morning with Pass+.`,
          })}
          onPress={mailbox.paywall ?? undefined}
          testID={`bookings-mailbox-provider-${provider}`}
        />
      );
    }
    return (
      <MailboxProviderCard
        key={provider}
        provider={provider}
        state="soon"
        title={name}
        sub={soonLine}
        testID={`bookings-mailbox-provider-${provider}`}
      />
    );
  };
  return (
    <MailboxSheetFrame onClose={props.onClose}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: th.space.gutter,
          paddingBottom: insets.bottom + th.space.gutter,
        }}
        testID={`bookings-mailbox-${status.kind === 'connected' ? 'on' : status.kind}`}
      >
        {Platform.OS === 'ios' ? null : (
          <View style={styles.close}>
            <TextButton
              label={t({ id: 'bookings.premium.done', message: 'Done' })}
              onPress={props.onClose}
              testID="bookings-mailbox-close"
            />
          </View>
        )}
        <View style={styles.head}>
          <Text variant="emptyTitle" style={styles.title} accessibilityRole="header">
            {t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' })}
          </Text>
          <View style={styles.doodle}>
            <Doodle name="chat" size={86} accent={th.accent.sky} />
          </View>
        </View>
        <Text variant="note" tone="muted" style={{ marginTop: th.space.gap8 }}>
          {t({
            id: 'bookings.premium.mailboxPromise',
            message: `${guideName} finds new bookings in your inbox every morning. Read-only, confirmations only.`,
          })}
        </Text>
        <View style={{ marginTop: th.space.gap16, gap: th.space.gap10 }}>
          {PROVIDERS.map(card)}
          {status.kind === 'choose' || status.kind === 'connected' ? (
            <View
              style={[
                styles.toggleRow,
                {
                  borderRadius: th.radius.card,
                  backgroundColor: th.color.card,
                  boxShadow: th.shadow.card,
                },
              ]}
            >
              <View style={styles.flex}>
                <Text variant="rowTitle">
                  {t({ id: 'bookings.mailbox.surface', message: 'Show finds to the crew' })}
                </Text>
                <Text variant="captionMuted" tone="muted">
                  {t({
                    id: 'bookings.mailbox.surfaceSub',
                    message: 'Off keeps them to you until you add them.',
                  })}
                </Text>
              </View>
              <Toggle
                value={mailbox.surface}
                onChange={mailbox.setSurface}
                accessibilityLabel={t({
                  id: 'bookings.mailbox.surface',
                  message: 'Show finds to the crew',
                })}
                testID="bookings-mailbox-surface"
              />
            </View>
          ) : null}
          {status.kind === 'soon' && props.address !== null ? (
            <Button
              label={props.address}
              variant="secondary"
              onPress={() => void mailbox.copy(props.address ?? '')}
              testID="bookings-mailbox-address"
            />
          ) : null}
        </View>
        {connected === null ? null : (
          <View style={[styles.center, { marginTop: th.space.gap16 }]}>
            <TextButton
              label={t({ id: 'bookings.mailbox.disconnect', message: 'Disconnect' })}
              color={th.color.destructive.text}
              onPress={disconnect}
              testID="bookings-mailbox-disconnect"
            />
          </View>
        )}
        {status.kind === 'soon' ? null : (
          <View style={[styles.center, { marginTop: th.space.gap10 }]}>
            <MailboxPassBadge th={th} onPress={status.kind === 'locked' ? mailbox.paywall : null} />
          </View>
        )}
        {mailbox.error ? (
          <Text
            variant="helper"
            color={th.color.destructive.helper}
            align="center"
            style={{ marginTop: th.space.gap10 }}
          >
            {t({
              id: 'bookings.mailbox.error',
              message: "That didn't work. Try again with signal.",
            })}
          </Text>
        ) : null}
      </ScrollView>
    </MailboxSheetFrame>
  );
}

const styles = StyleSheet.create({
  close: { alignItems: 'flex-end' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { maxWidth: 230 },
  doodle: { marginTop: -12 },
  flex: { flex: 1, minWidth: 0 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  center: { alignItems: 'center' },
});
