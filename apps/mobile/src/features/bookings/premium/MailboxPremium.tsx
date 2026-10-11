/**
 * Find bookings in my email (7.05), as the system sheet: the promise (read-only, confirmations
 * only), "Show finds to the crew", and Connect Gmail / Outlook; connected, the mint-ringed card
 * with the provider and Disconnect (asked first). Without Pass+ it says what Pass+ adds and opens
 * it; where the mailbox is not offered yet it points at the forward address.
 */
import type { MailboxProvider } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { IconTile } from '@/features/trip';
import { Button, Icon, Text, TextButton, Toggle, usePremiumTheme, ring } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { useMailboxActions } from '../add/use-mailbox-actions';
import { useWalletGuide } from '../data/wallet-guide';
import type { MailboxStatus } from '../mailbox/use-mailbox';

export function MailboxPremium(props: {
  readonly status: MailboxStatus;
  readonly address: string | null;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const mailbox = useMailboxActions(props.status, props.onChanged);
  const { status } = props;
  const providerName = (provider: MailboxProvider) =>
    provider === 'gmail'
      ? t({ id: 'bookings.mailbox.gmail', message: 'Gmail' })
      : t({ id: 'bookings.mailbox.outlook', message: 'Outlook' });
  const promise = t({
    id: 'bookings.mailbox.promise',
    message:
      'Read-only, confirmations only. I look at senders and subjects around your trip dates and open only the bookings.',
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
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={props.onClose}
      testID="bookings-mailbox"
    >
      <ScrollView
        style={{ backgroundColor: th.color.ground }}
        contentContainerStyle={[styles.body, { padding: th.space.gutter, gap: th.space.gap14 }]}
      >
        <View style={styles.head}>
          <Text variant="emptyTitle" style={styles.flex} accessibilityRole="header">
            {t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' })}
          </Text>
          <TextButton
            label={t({ id: 'bookings.premium.done', message: 'Done' })}
            onPress={props.onClose}
            testID="bookings-mailbox-close"
          />
        </View>
        {status.kind === 'soon' ? (
          <View style={{ gap: th.space.gap10 }} testID="bookings-mailbox-soon">
            <Text variant="body">
              {t({
                id: 'bookings.mailbox.soon',
                message: 'Coming soon — forward confirmations meanwhile.',
              })}
            </Text>
            {props.address === null ? null : (
              <Button
                label={props.address}
                variant="secondary"
                onPress={() => void mailbox.copy(props.address ?? '')}
                testID="bookings-mailbox-address"
              />
            )}
          </View>
        ) : null}
        {status.kind === 'locked' ? (
          <View style={{ gap: th.space.gap10 }} testID="bookings-mailbox-locked">
            <Text variant="body" tone="inkSecondary">
              {t({
                id: 'bookings.mailbox.lockedLine',
                message: `${guideName} checks your inbox for new confirmations every morning with Pass+.`,
              })}
            </Text>
            {mailbox.paywall === null ? null : (
              <Button
                label={t({ id: 'bookings.mailbox.seePass', message: 'See Pass+' })}
                onPress={mailbox.paywall}
                testID="bookings-mailbox-see-pass"
              />
            )}
          </View>
        ) : null}
        {status.kind === 'choose' ? (
          <View style={{ gap: th.space.gap12 }} testID="bookings-mailbox-choose">
            <Text variant="rowText" tone="muted">
              {promise}
            </Text>
            <View
              style={[
                styles.row,
                styles.card,
                {
                  borderRadius: th.radius.banner,
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
            {status.providers.map((provider) => (
              <Button
                key={provider}
                label={t({
                  id: 'bookings.mailbox.connect',
                  message: `Connect ${providerName(provider)}`,
                })}
                loading={mailbox.busy}
                onPress={() => mailbox.connect(provider)}
                testID={`bookings-mailbox-connect-${provider}`}
              />
            ))}
          </View>
        ) : null}
        {status.kind === 'connected' ? (
          <View style={{ gap: th.space.gap12 }} testID="bookings-mailbox-connected">
            <View
              style={[
                styles.row,
                styles.card,
                {
                  borderRadius: th.radius.card,
                  backgroundColor: th.color.card,
                  boxShadow: ring(2, th.accent.mint),
                },
              ]}
            >
              <IconTile name="mail" bg={th.color.control} color={th.color.ink} size={42} />
              <Text variant="rowTitle" style={styles.flex}>
                {t({
                  id: 'bookings.mailbox.connected',
                  message: `Connected · ${providerName(status.connection.provider)}`,
                })}
              </Text>
              <View style={[styles.check, { backgroundColor: th.accent.mint }]}>
                <Icon name="check" size={14} color={th.color.onAccent} />
              </View>
            </View>
            <Text variant="rowText" tone="muted">
              {t({
                id: 'bookings.mailbox.footnote',
                message:
                  'I check for new confirmations every morning. You can switch that off in Settings.',
              })}
            </Text>
            <View style={styles.center}>
              <TextButton
                label={t({ id: 'bookings.mailbox.disconnect', message: 'Disconnect' })}
                color={th.color.destructive.text}
                onPress={disconnect}
                testID="bookings-mailbox-disconnect"
              />
            </View>
          </View>
        ) : null}
        {mailbox.error ? (
          <Text variant="helper" color={th.color.destructive.helper}>
            {t({
              id: 'bookings.mailbox.error',
              message: "That didn't work. Try again with signal.",
            })}
          </Text>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { paddingVertical: 12, paddingHorizontal: 14 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center' },
});
