/**
 * 2.03 / 2.04 the first-launch paste offer: a sun band with a generic crew ticket (nothing has been
 * read yet, so it names no crew), the kit's paste pill (the clipboard is read only on its tap), and "No link, start fresh". A pasted crew link or code goes on to be
 * claimed; anything else says what it was, keeps a web link for the first trip (its card can take
 * it back out), and offers to type a code or start fresh.
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PasteOfferControls } from '@/lib/links/SplashResolveGate';
import { CODE_ENTRY_ROUTE } from '@/lib/links/route-map';
import {
  Button,
  CritterSticker,
  GlassIconButton,
  GuideNote,
  PasteButton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { guideFacts } from '../../guide-faces';
import { classifyPaste, type PasteSource } from '../../paste-classify';
import { saveFirstTripLink, type SavedLink } from '../../saved-link';
import { tilt } from '../components/tilt';
import { SavedLinkCard } from './SavedLinkCard';

export interface PremiumPasteOfferProps extends PasteOfferControls {
  readonly onShown: () => void;
}

function notInviteTitle(source: PasteSource | null): string {
  switch (source) {
    case 'tiktok':
      return t({
        id: 'onboarding.premium.paste.tiktok',
        message: 'That’s a TikTok, not an invite',
      });
    case 'instagram':
      return t({
        id: 'onboarding.premium.paste.instagram',
        message: 'That’s an Instagram post, not an invite',
      });
    case 'youtube':
      return t({
        id: 'onboarding.premium.paste.youtube',
        message: 'That’s a YouTube video, not an invite',
      });
    case 'maps':
      return t({ id: 'onboarding.premium.paste.maps', message: 'That’s a map pin, not an invite' });
    case null:
      return t({ id: 'onboarding.premium.paste.other', message: 'That’s a link, not an invite' });
  }
}

function TicketArt() {
  const theme = usePremiumTheme();
  const tokek = guideFacts('tokek');
  return (
    <View style={{ width: 250, height: 290 }}>
      <View
        style={{
          position: 'absolute',
          left: 30,
          top: 40,
          width: 190,
          height: 230,
          borderRadius: theme.radius.card,
          backgroundColor: theme.color.card,
          padding: 16,
          transform: [{ rotate: tilt(-5) }],
          boxShadow: theme.shadow.card,
        }}
      >
        <Text variant="badge" tone="placeholder">
          {t({ id: 'onboarding.premium.paste.ticketHead', message: 'CREW INVITE' })}
        </Text>
        <View
          style={{
            marginTop: 10,
            height: 22,
            width: 120,
            borderRadius: 6,
            backgroundColor: theme.color.control,
          }}
        />
        <View
          style={{
            marginTop: 58,
            paddingTop: 12,
            borderTopWidth: 2,
            borderStyle: 'dashed',
            borderColor: theme.color.fieldBorder,
          }}
        >
          <View
            style={{
              height: 20,
              width: 110,
              borderRadius: 6,
              backgroundColor: theme.color.control,
            }}
          />
        </View>
      </View>
      <View
        style={{ position: 'absolute', left: 150, top: -26, transform: [{ rotate: tilt(10) }] }}
      >
        <CritterSticker kind={tokek.kind} name={tokek.name} size={118} pose="point" />
      </View>
    </View>
  );
}

export function PremiumPasteOffer({ onPasted, onSkip, onShown }: PremiumPasteOfferProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const available = Clipboard.isPasteButtonAvailable;
  const [notInvite, setNotInvite] = useState<{
    source: PasteSource | null;
    saved: SavedLink | null;
  } | null>(null);
  const tokek = guideFacts('tokek');

  useEffect(() => {
    onShown();
    if (!available) onSkip();
  }, [available, onShown, onSkip]);
  if (!available) return null;

  const onPaste = (text: string) => {
    const kind = classifyPaste(text);
    if (kind.kind === 'invite') onPasted(text);
    else setNotInvite({ source: kind.source, saved: saveFirstTripLink(text, kind.source) });
  };
  const typeCode = () => {
    onSkip();
    router.push(CODE_ENTRY_ROUTE);
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.ground }]}
      testID="paste-link-offer"
    >
      <View
        style={{
          height: notInvite === null ? 470 : 300,
          backgroundColor: theme.accent.sun,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: notInvite === null ? 40 : 20,
        }}
      >
        {notInvite === null ? (
          <TicketArt />
        ) : (
          <CritterSticker kind={tokek.kind} name={tokek.name} size={160} pose="think" />
        )}
      </View>
      <View
        style={{
          position: 'absolute',
          top: insets.top + theme.space.gap6,
          left: theme.space.gutter,
        }}
      >
        <GlassIconButton
          icon="close"
          label={t({ id: 'common.sheet.close', message: 'Close' })}
          onPress={onSkip}
          testID="paste-link-skip"
        />
      </View>
      <View
        style={{ flex: 1, paddingHorizontal: 28, paddingTop: 30, gap: 10, alignItems: 'center' }}
      >
        <Text variant="emptyTitle" align="center" accessibilityRole="header">
          {notInvite === null
            ? t({ id: 'onboarding.premium.paste.title', message: 'Copied a crew link?' })
            : notInviteTitle(notInvite.source)}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {notInvite === null
            ? t({
                id: 'onboarding.premium.paste.line',
                message:
                  'Paste it and you land straight in your crew. Nothing is read until you tap.',
              })
            : t({
                id: 'onboarding.premium.paste.notInviteLine',
                message: 'No crew in that one. Type the code from your invite, or start fresh.',
              })}
        </Text>
        {notInvite?.saved == null ? null : (
          <SavedLinkCard link={notInvite.saved} source={notInvite.source} />
        )}
        {notInvite === null ? null : (
          <View style={{ alignSelf: 'stretch', marginTop: 12 }}>
            <GuideNote
              name={tokek.name}
              critter={tokek.kind}
              text={t({
                id: 'onboarding.premium.paste.hint',
                message: 'Invites look like go.critterpass.app/i/… or a six-character code.',
              })}
            />
          </View>
        )}
      </View>
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: theme.space.gap8,
          alignItems: 'center',
        }}
      >
        {notInvite === null ? (
          <View style={{ width: 200 }}>
            <PasteButton
              label={t({ id: 'onboarding.premium.paste.paste', message: 'Paste' })}
              variant="primary"
              size="large"
              onPaste={onPaste}
              testID="paste-offer-paste"
            />
          </View>
        ) : (
          <Button
            label={t({ id: 'onboarding.premium.paste.typeCode', message: 'Type a crew code' })}
            onPress={typeCode}
            testID="paste-type-code"
          />
        )}
        <TextButton
          align="center"
          label={
            notInvite === null
              ? t({ id: 'onboarding.premium.paste.fresh', message: 'No link, start fresh' })
              : t({ id: 'onboarding.premium.paste.startFresh', message: 'Start fresh' })
          }
          onPress={onSkip}
          testID="paste-start-fresh"
        />
      </View>
    </View>
  );
}
