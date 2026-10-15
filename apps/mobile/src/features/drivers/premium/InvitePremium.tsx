/**
 * Invite {name} to be listed, in the drivers look (6.20, 6.24): he decides, and nothing about him is
 * public until he confirms on his own phone. The message the member sends is an editable field
 * (Bahasa added below it when asked), the link's end date under it, and Open in WhatsApp riding the
 * keyboard: WhatsApp gets the text and the member presses send.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  ListCard,
  Row,
  Skeleton,
  Text,
  TextField,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { useInvite } from '../invite/use-invite';

export function InvitePremium({
  tripId,
  providerId,
}: {
  readonly tripId: string;
  readonly providerId: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const invite = useInvite(tripId, providerId);
  const name = invite.name;
  const expiresOn = invite.expiresOn;
  const back = t({ id: 'drivers.rate.back', message: 'Our drivers' });
  const pad = { paddingHorizontal: th.space.gutter, gap: th.space.gap12 };
  if (invite.driver === null) {
    return (
      <PushScreen title={back} backLabel={back} testID="drivers-invite-loading">
        <View style={[styles.body, pad]}>
          <Skeleton height={36} width="70%" />
          <Skeleton height={220} radius={th.radius.cardLarge} />
        </View>
      </PushScreen>
    );
  }
  const bahasa = t({ id: 'drivers.invite.bahasa', message: 'Add it in Bahasa too' });
  return (
    <PushScreen
      title={t({ id: 'drivers.premium.inviteTitle', message: `Invite ${name}` })}
      backLabel={back}
      scroll={false}
      testID="drivers-invite"
    >
      <KeyboardAwareScroll
        contentContainerStyle={[styles.body, pad, { paddingBottom: insets.bottom + 120 }]}
      >
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'drivers.invite.title', message: `Invite ${name} to be listed` })}
        </Text>
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.invite.intro',
            message: `${name} decides. Nothing about him is public until he confirms on his own phone, and he can take it down anytime.`,
          })}
        </Text>
        <Text variant="captionMuted" tone="muted">
          {t({ id: 'drivers.invite.message', message: 'The message · you send it' })}
        </Text>
        {invite.message === null ? (
          <Text
            variant="rowText"
            {...(invite.error === null
              ? { tone: 'muted' as const }
              : { color: th.color.destructive.helper })}
            testID="drivers-invite-waiting"
          >
            {invite.error ?? t({ id: 'drivers.invite.making', message: 'Making his link…' })}
          </Text>
        ) : (
          <TextField
            accessibilityLabel={t({
              id: 'drivers.invite.messageLabel',
              message: 'Message to your driver',
            })}
            value={invite.message}
            onChangeText={invite.setMessage}
            multiline
            testID="drivers-invite-text"
          />
        )}
        <ListCard>
          <Row
            title={bahasa}
            trailing={
              <Toggle
                value={invite.withBahasa}
                onChange={invite.setBahasa}
                accessibilityLabel={bahasa}
                testID="drivers-invite-bahasa"
              />
            }
          />
        </ListCard>
        {expiresOn === null ? null : (
          <Text variant="captionMuted" tone="muted">
            {t({
              id: 'drivers.invite.expires',
              message: `The link works until ${expiresOn}. After that it switches off and nothing is listed.`,
            })}
          </Text>
        )}
      </KeyboardAwareScroll>
      <KeyboardStickyFooter openedOffset={th.space.gap12}>
        <View
          style={{
            paddingHorizontal: th.space.titleGutter,
            paddingBottom: Math.max(insets.bottom, th.space.gap12),
          }}
        >
          <Button
            label={t({ id: 'drivers.invite.open', message: 'Open in WhatsApp' })}
            icon="send"
            onPress={invite.openWhatsApp}
            disabled={invite.message === null}
            testID="drivers-invite-open"
          />
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
});
