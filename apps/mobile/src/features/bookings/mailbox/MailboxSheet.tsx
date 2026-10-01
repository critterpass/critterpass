/**
 * "Find bookings in my email" (3h-2 footnote, 3n-2 row; the sheet is undesigned): while no
 * provider is switched on, "Coming soon — forward confirmations meanwhile" with the forward
 * address; without Pass+, the locked teaser that opens the paywall; with Pass+, CONNECT GMAIL /
 * CONNECT OUTLOOK and whether the crew sees what it finds; once connected, what it does and
 * DISCONNECT.
 */
import type { MailboxProvider } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { LockedTeaser } from '@/ui/states/LockedTeaser';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { AddressPill } from '../add/ImportTiles';
import type { MailboxStatus } from './use-mailbox';
import { useWalletGuide } from '../data/wallet-guide';

const useStyles = makeStyles((t) => ({ body: { padding: t.space['16'], gap: t.space['16'] } }));

export interface MailboxSheetProps {
  readonly status: MailboxStatus;
  readonly address: string | null;
  readonly surfaceToCrew: boolean;
  readonly busy: boolean;
  readonly error: boolean;
  /** Null until the paywall area registers its entry. */
  readonly onPaywall: (() => void) | null;
  readonly onSurface: (next: boolean) => void;
  readonly onConnect: (provider: MailboxProvider) => void;
  readonly onDisconnect: () => void;
  readonly onCopy: (address: string) => Promise<void>;
  readonly onClose: () => void;
}

export function MailboxSheet(props: MailboxSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const title = t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' });
  const secondary = theme.semantic.text.secondary;
  const providerName = (provider: MailboxProvider) =>
    provider === 'gmail'
      ? t({ id: 'bookings.mailbox.gmail', message: 'Gmail' })
      : t({ id: 'bookings.mailbox.outlook', message: 'Outlook' });
  const { status } = props;
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID="bookings-mailbox"
    >
      <View style={styles.body}>
        {status.kind === 'soon' ? (
          <Stack gap="12" testID="bookings-mailbox-soon">
            <Text variant="bodyLg">
              {t({
                id: 'bookings.mailbox.soon',
                message: 'Coming soon — forward confirmations meanwhile.',
              })}
            </Text>
            {props.address === null ? null : (
              <AddressPill address={props.address} onCopy={props.onCopy} />
            )}
          </Stack>
        ) : null}
        {status.kind === 'locked' ? (
          props.onPaywall === null ? (
            <Text variant="body" color={secondary} testID="bookings-mailbox-locked">
              {t({
                id: 'bookings.mailbox.lockedLine',
                message: `${guideName} checks your inbox for new confirmations every morning with Pass+.`,
              })}
            </Text>
          ) : (
            <LockedTeaser
              plan="passPlus"
              perk={t({
                id: 'bookings.mailbox.perk',
                message: `${guideName} finds new bookings in your inbox every morning`,
              })}
              onPress={props.onPaywall}
              testID="bookings-mailbox-locked"
            />
          )
        ) : null}
        {status.kind === 'choose' ? (
          <Stack gap="12" testID="bookings-mailbox-choose">
            <Text variant="body" color={secondary}>
              {t({
                id: 'bookings.mailbox.promise',
                message:
                  'Read-only, confirmations only. I look at senders and subjects around your trip dates and open only the bookings.',
              })}
            </Text>
            <SettingsGroup
              rows={[
                {
                  key: 'surface',
                  kind: 'toggle',
                  title: t({ id: 'bookings.mailbox.surface', message: 'Show finds to the crew' }),
                  subtitle: t({
                    id: 'bookings.mailbox.surfaceSub',
                    message: 'Off keeps them to you until you add them.',
                  }),
                  value: props.surfaceToCrew,
                  onChange: props.onSurface,
                },
              ]}
            />
            {status.providers.map((provider) => (
              <PillButton
                key={provider}
                label={t({
                  id: 'bookings.mailbox.connect',
                  message: `Connect ${providerName(provider)}`,
                })}
                onPress={() => props.onConnect(provider)}
                loading={props.busy}
                testID={`bookings-mailbox-connect-${provider}`}
              />
            ))}
          </Stack>
        ) : null}
        {status.kind === 'connected' ? (
          <Stack gap="12" testID="bookings-mailbox-connected">
            <Text variant="title">
              {t({
                id: 'bookings.mailbox.connected',
                message: `Connected · ${providerName(status.connection.provider)}`,
              })}
            </Text>
            <Text variant="body" color={secondary}>
              {t({
                id: 'bookings.mailbox.footnote',
                message:
                  'I check for new confirmations every morning. You can switch that off in Settings.',
              })}
            </Text>
            <PillButton
              label={t({ id: 'bookings.mailbox.disconnect', message: 'Disconnect' })}
              onPress={props.onDisconnect}
              variant="destructive"
              loading={props.busy}
              testID="bookings-mailbox-disconnect"
            />
          </Stack>
        ) : null}
        {props.error ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent}>
            {t({
              id: 'bookings.mailbox.error',
              message: "That didn't work. Try again with signal.",
            })}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
