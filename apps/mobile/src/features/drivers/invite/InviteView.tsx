/**
 * Invite {name} to be listed (6g-2): he decides, nothing about him is public until he confirms on
 * his own phone. THE MESSAGE · YOU SEND IT is editable, "Add it in Bahasa too" appends the ID copy,
 * and OPEN IN WHATSAPP hands the text to WhatsApp, where the member presses send.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Toggle } from '@/ui/inputs/Toggle';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface InviteViewProps {
  readonly name: string;
  readonly message: string | null;
  readonly withBahasa: boolean;
  readonly expiresOn: string | null;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onMessage: (text: string) => void;
  readonly onBahasa: (on: boolean) => void;
  readonly onOpenWhatsApp: () => void;
}

export function InviteView(props: InviteViewProps) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const name = props.name;
  const expiresOn = props.expiresOn;
  return (
    <Scaffold testID="drivers-invite">
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['20'],
          gap: theme.space['16'],
          paddingBottom: theme.space['32'] + theme.space['16'],
        }}
      >
        <BackEyebrow
          label={t({ id: 'drivers.rate.back', message: 'Our drivers' })}
          onPress={props.onBack}
        />
        <Text variant="displayXl">
          {upper(t({ id: 'drivers.invite.title', message: `Invite ${name} to be listed` }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.invite.intro',
            message: `${name} decides. Nothing about him is public until he confirms on his own phone, and he can take it down anytime.`,
          })}
        </Text>
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {upper(t({ id: 'drivers.invite.message', message: 'The message · you send it' }), locale)}
        </Text>
        {props.message === null ? (
          <Text variant="body" testID="drivers-invite-waiting">
            {props.error ?? t({ id: 'drivers.invite.making', message: 'Making his link…' })}
          </Text>
        ) : (
          <TextField
            label={t({ id: 'drivers.invite.messageLabel', message: 'Message to your driver' })}
            labelHidden
            value={props.message}
            onChangeText={props.onMessage}
            maxLines={14}
            testID="drivers-invite-text"
          />
        )}
        <Toggle
          label={t({ id: 'drivers.invite.bahasa', message: 'Add it in Bahasa too' })}
          value={props.withBahasa}
          onValueChange={props.onBahasa}
          testID="drivers-invite-bahasa"
        />
        {props.expiresOn === null ? null : (
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({
              id: 'drivers.invite.expires',
              message: `The link works until ${expiresOn}. After that it switches off and nothing is listed.`,
            })}
          </Text>
        )}
        <PillButton
          label={t({ id: 'drivers.invite.open', message: 'Open in WhatsApp' })}
          onPress={props.onOpenWhatsApp}
          disabled={props.message === null}
          testID="drivers-invite-open"
        />
      </ScrollView>
    </Scaffold>
  );
}
