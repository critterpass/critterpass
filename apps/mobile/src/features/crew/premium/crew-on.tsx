/**
 * The crew is on (3.09): the crew's ticket lands (Lively, a success tap), the stub in the cover
 * colour with its sticker and name, the code as split-flap tiles you tap to copy, then the ways to
 * send it (Messages and More open the system share sheet, Copy code, the QR code), "Invite the
 * crew" into the invite sheet, and Done back to Home on the new crew.
 */
import { t } from '@lingui/core/macro';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CrewCover } from '@cp/domain';

import {
  Button,
  CritterSticker,
  GuideNote,
  PressableScale,
  SPRINGS,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { guideSticker } from '@/ui/premium/stickers/guides';
import { useNoBackByDesign } from '@/lib/qa/back-affordance';

import { useCrewServices } from '../crews-sheet/crew-services';
import { crewInviteRoute } from '../crews-sheet/routes';
import { qrChannelLink } from '../invite-composer/qr-path';
import { returnHome } from '../start-crew/return-home';
import { inviteMessage } from './crew-copy';
import { passInk } from './crew-look';
import { ShareTarget, SplitFlapCode } from './components/crew-bits';
import { QrCode } from './components/qr-code';

export interface CrewOnProps {
  readonly crewId: string;
  readonly name: string;
  readonly art: string;
  readonly cover: CrewCover;
  readonly code: string | null;
}

export function CrewOn({ crewId, name, art, cover, code }: CrewOnProps) {
  // The crew is made: Done leaves, and the design draws no back or ✕ over the new pass.
  useNoBackByDesign();
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const insets = useSafeAreaInsets();
  const services = useCrewServices();
  const look = passInk(cover);
  const sticker = guideSticker(art);
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const land = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!reduced) land.value = withSpring(1, SPRINGS.lively);
  }, [land, reduced]);
  const ticket = useAnimatedStyle(() => ({
    opacity: land.value,
    transform: [{ translateY: (1 - land.value) * 30 }, { rotate: `${-2 * land.value}deg` }],
  }));

  const share = () => {
    if (code !== null) void services.share(inviteMessage(name, services.inviteUrl(code), code));
  };
  const copy = () => {
    if (code === null) return;
    void services.copy(code).then(() => setCopied(true));
  };

  return (
    <View style={[styles.root, { backgroundColor: th.color.ground }]} testID="crew-created">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 24 }]}>
        <Text variant="label" tone="muted" align="center">
          {t({ id: 'crew.premium.on.kicker', message: 'Crew made' })}
        </Text>
        <Text variant="display" align="center" accessibilityRole="header">
          {t({ id: 'crew.premium.on.title', message: `${name} is on` })}
        </Text>
        <Animated.View
          style={[
            styles.ticket,
            { backgroundColor: th.color.card, boxShadow: th.shadow.card },
            ticket,
          ]}
        >
          <View style={[styles.stub, { backgroundColor: look.fill }]}>
            <View style={styles.crest}>
              <View style={[styles.crestDisc, { backgroundColor: th.accent.stickerEdge }]} />
              <CritterSticker
                kind={sticker.kind}
                seed={sticker.seed}
                name={sticker.name}
                size={84}
              />
            </View>
            <View style={styles.grow}>
              <Text variant="tier" color={look.ink} style={styles.kicker}>
                {t({ id: 'crew.premium.pass.kicker', message: 'CREW PASS' })}
              </Text>
              <Text
                variant="title"
                color={look.light ? look.ink : th.accent.stickerEdge}
                numberOfLines={2}
              >
                {name.toLocaleUpperCase()}
              </Text>
            </View>
          </View>
          <View style={[styles.perforation, { borderColor: th.color.fieldBorder }]}>
            <View style={[styles.notch, styles.notchLeft, { backgroundColor: th.color.ground }]} />
            <View style={[styles.notch, styles.notchRight, { backgroundColor: th.color.ground }]} />
          </View>
          <PressableScale
            // The code tiles below are the accessible element: they read the code and copy it.
            accessible={false}
            onPress={copy}
            style={styles.body}
            testID="start-crew-code"
          >
            <View style={styles.codeHead}>
              <Text variant="caption" tone="muted">
                {t({ id: 'crew.start.codeLabel', message: 'Crew code' })}
              </Text>
              <Text variant="caption" tone="muted">
                {copied
                  ? t({ id: 'crew.premium.on.copied', message: 'Copied' })
                  : t({ id: 'crew.premium.on.tapToCopy', message: 'Tap to copy' })}
              </Text>
            </View>
            <SplitFlapCode
              code={code}
              copyHint={t({ id: 'crew.premium.on.copyA11y', message: 'Copy the crew code' })}
              testID="crew-on-code"
            />
          </PressableScale>
        </Animated.View>
        {qr && code !== null ? (
          <View style={styles.qr}>
            <QrCode url={qrChannelLink(services.inviteUrl(code))} size={180} testID="crew-on-qr" />
          </View>
        ) : null}
        <View style={styles.targets}>
          <ShareTarget
            label={t({ id: 'crew.premium.share.messages', message: 'Messages' })}
            icon="send"
            tint={th.color.toggleOn}
            onPress={share}
            testID="start-crew-share"
          />
          <ShareTarget
            label={t({ id: 'crew.premium.share.copy', message: 'Copy code' })}
            icon="paste"
            onPress={copy}
          />
          <ShareTarget
            label={t({ id: 'crew.premium.share.qr', message: 'QR' })}
            icon="expand"
            onPress={() => setQr((on) => !on)}
            testID="crew-on-qr-toggle"
          />
          <ShareTarget
            label={t({ id: 'crew.premium.share.more', message: 'More' })}
            icon="share"
            onPress={share}
          />
        </View>
        <GuideNote
          name="Tokek"
          text={t({
            id: 'crew.premium.on.note',
            message: 'Ten crews max. Five seats are waiting on this one.',
          })}
        />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={t({ id: 'crew.premium.on.invite', message: 'Invite the crew' })}
          onPress={() => router.push(crewInviteRoute(crewId))}
          testID="start-crew-invite"
        />
        <TextButton
          label={t({ id: 'crew.start.done', message: 'Done' })}
          onPress={returnHome}
          testID="start-crew-done"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 28, gap: 16, paddingBottom: 24 },
  ticket: { borderRadius: 28, overflow: 'hidden' },
  stub: { height: 150, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  crest: {
    width: 96,
    height: 96,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  kicker: { letterSpacing: 2.6 },
  crestDisc: { ...StyleSheet.absoluteFill, borderRadius: 30, opacity: 0.24 },
  perforation: { borderTopWidth: 2, borderStyle: 'dashed' },
  notch: { position: 'absolute', top: -12, width: 24, height: 24, borderRadius: 12 },
  notchLeft: { left: -12 },
  notchRight: { right: -12 },
  body: { padding: 16, paddingHorizontal: 18, gap: 10 },
  codeHead: { flexDirection: 'row', justifyContent: 'space-between' },
  targets: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: { paddingHorizontal: 24, gap: 4 },
  qr: { alignItems: 'center' },
});
