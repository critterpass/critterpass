/**
 * The invite sheet (3.10): the crew code with its QR code, how long it works (the expiry the
 * server gave it), Copy link, and the apps to send it with: WhatsApp and Messages open with the
 * invite written, Telegram and Mail too where the phone has them, More is the system share sheet
 * (also the fallback when an app cannot open). An organiser without a live code mints one here.
 * Nobody who has not joined is named, and nothing is sent on anyone's behalf.
 */
import { t } from '@lingui/core/macro';
import { useLocalSearchParams } from 'expo-router';
import { useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Card, GuideNote, PressableScale, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { composeUrl } from '../invite-composer/compose';
import { qrChannelLink } from '../invite-composer/qr-path';
import { ROTATE_JOIN_CODE } from '../crews-sheet/crew-commands';
import { useCrewServices } from '../crews-sheet/crew-services';
import { useCrewDetail } from '../settings/use-crew-detail';
import { codeValidLine, inviteMessage } from './crew-copy';
import { ShareTarget } from './components/crew-bits';
import { QrCode } from './components/qr-code';

export function InviteSheet() {
  const th = usePremiumTheme();
  const locale = useLocale();
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  const detail = useCrewDetail(crewId);
  const services = useCrewServices();
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [copied, setCopied] = useState(false);
  const [minting, setMinting] = useState(false);
  const code = detail.code?.code ?? null;
  const crewName = detail.crew?.name ?? '';
  const url = code === null ? null : services.inviteUrl(code);
  const message = code === null || url === null ? '' : inviteMessage(crewName, url, code);

  const send = (channel: 'wa' | 'imsg' | 'tg' | 'mail' | 'more') => {
    if (message === '') return;
    const text = encodeURIComponent(message);
    const target =
      channel === 'wa' || channel === 'imsg'
        ? composeUrl(channel, message)
        : channel === 'tg'
          ? // eslint-disable-next-line lingui/no-unlocalized-strings -- a URL scheme, never copy.
            `tg://msg?text=${text}`
          : channel === 'mail'
            ? // eslint-disable-next-line lingui/no-unlocalized-strings -- a URL scheme, never copy.
              `mailto:?body=${text}`
            : null;
    if (target === null) {
      void services.share(message);
      return;
    }
    void services.openUrl(target).then((opened) => {
      if (!opened) void services.share(message);
    });
  };

  const mint = () => {
    if (commands === null || minting) return;
    setMinting(true);
    void commands.send(ROTATE_JOIN_CODE, { crew_id: crewId }).finally(() => setMinting(false));
  };

  const valid = codeValidLine(detail.code?.expires_at ?? null, locale);
  return (
    <SheetScreen
      cancelLabel={t({ id: 'crew.premium.close', message: 'Close' })}
      testID="crew-invite"
    >
      <Text variant="emptyTitle" accessibilityRole="header">
        {t({ id: 'crew.premium.invite.title', message: `Invite to ${crewName}` })}
      </Text>
      <Text variant="body" tone="muted" style={styles.sub}>
        {valid ??
          t({ id: 'crew.premium.invite.noCode', message: 'There’s no live code right now.' })}
      </Text>
      <Card style={[styles.codeCard, { gap: th.space.gap14 }]} radius={th.radius.cardLarge}>
        {url === null ? (
          <View style={styles.grow}>
            {detail.canManage ? (
              <Button
                label={t({ id: 'crew.settings.rotate', message: 'New code' })}
                size="medium"
                loading={minting}
                onPress={mint}
                testID="crew-invite-mint"
              />
            ) : (
              <Text variant="body" tone="muted">
                {t({
                  id: 'crew.premium.invite.askOrganiser',
                  message: 'The organiser can make a fresh code.',
                })}
              </Text>
            )}
          </View>
        ) : (
          <>
            <QrCode url={qrChannelLink(url)} size={124} testID="crew-invite-qr" />
            <View style={styles.grow}>
              <Text variant="caption" tone="muted">
                {t({ id: 'crew.start.codeLabel', message: 'Crew code' })}
              </Text>
              <Text variant="stat" style={styles.code} testID="crew-invite-code">
                {code}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t({ id: 'crew.premium.invite.copyLink', message: 'Copy link' })}
                onPress={() => void services.copy(url).then(() => setCopied(true))}
                style={[styles.copy, { backgroundColor: th.color.control }]}
                testID="crew-invite-copy"
              >
                <Text variant="pillSmall">
                  {copied
                    ? t({ id: 'crew.premium.on.copied', message: 'Copied' })
                    : t({ id: 'crew.premium.invite.copyLink', message: 'Copy link' })}
                </Text>
              </PressableScale>
            </View>
          </>
        )}
      </Card>
      <Text variant="label" tone="muted" style={styles.sendLabel}>
        {t({ id: 'crew.premium.invite.sendWith', message: 'Send with' })}
      </Text>
      <View style={styles.apps}>
        <ShareTarget
          label="WhatsApp"
          icon="send"
          tint={th.accent.mint}
          onPress={() => send('wa')}
          testID="crew-invite-wa"
        />
        <ShareTarget
          label={t({ id: 'crew.premium.share.messages', message: 'Messages' })}
          icon="send"
          tint={th.color.toggleOn}
          onPress={() => send('imsg')}
          testID="crew-invite-imsg"
        />
        <ShareTarget label="Telegram" icon="send" tint={th.accent.sky} onPress={() => send('tg')} />
        <ShareTarget
          label={t({ id: 'crew.premium.share.mail', message: 'Mail' })}
          icon="send"
          tint={th.color.status.rain.text}
          onPress={() => send('mail')}
        />
        <ShareTarget
          label={t({ id: 'crew.premium.share.more', message: 'More' })}
          icon="more"
          onPress={() => send('more')}
          testID="crew-invite-more"
        />
      </View>
      <GuideNote
        name="Tokek"
        text={t({
          id: 'crew.premium.invite.note',
          message: 'Anyone with the code can join until it runs out. A new code stops the old one.',
        })}
      />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: 4, marginBottom: 16 },
  codeCard: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  grow: { flex: 1, gap: 6 },
  code: { letterSpacing: 2.4 },
  copy: {
    alignSelf: 'flex-start',
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 13,
    justifyContent: 'center',
  },
  sendLabel: { marginTop: 20, marginBottom: 10 },
  apps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
});
