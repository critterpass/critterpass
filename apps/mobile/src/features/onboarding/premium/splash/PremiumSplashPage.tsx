/**
 * 2.01 the splash: the tangerine passport cover bobbing in the middle, the guides floating around
 * it, Tokek waving with his sticky note, and the ways in at the bottom (open a pass, an invite
 * code, sign in to a pass made before). Everything is bundled, so a first launch without signal
 * looks the same. No back: it is the first screen. A phone that held a saved pass before (a
 * reinstall) gets the Welcome back splash instead.
 */
import { t } from '@lingui/core/macro';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CritterSticker, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { guideFace } from '../../photo/use-photo-step';
import { useReturningInstall } from '../../splash/returning-marker';
import { useSplashActions } from '../../splash/use-splash-actions';
import { IdleFloat } from '../components/IdleFloat';
import { COVER_FRAME } from '../components/onboarding-colours';
import { tilt } from '../components/tilt';
import { WelcomeBack } from './WelcomeBack';

const FLOATERS = [
  { id: 'pon', left: '3%', top: '6%', size: 76, period: 4600, delay: 0 },
  { id: 'lundi', left: '76%', top: '8%', size: 72, period: 5000, delay: 700 },
  { id: 'ajo', left: '2%', top: '52%', size: 92, period: 4400, delay: 300 },
  { id: 'sardi', left: '72%', top: '56%', size: 90, period: 5000, delay: 900 },
] as const;

function Cover() {
  const theme = usePremiumTheme();
  return (
    <View
      testID="onboarding-cover"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t({ id: 'onboarding.splash.coverTitle', message: 'CRITTERPASS' })}
      style={{
        width: 184,
        height: 250,
        borderTopLeftRadius: 10,
        borderBottomLeftRadius: 10,
        borderTopRightRadius: 22,
        borderBottomRightRadius: 22,
        backgroundColor: theme.accent.tangerine,
        boxShadow: theme.shadow.card,
        padding: 11,
        paddingStart: 20,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 15,
          borderWidth: 1.5,
          borderColor: COVER_FRAME,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space.gap16,
        }}
      >
        <Text variant="badge" color={theme.accent.sun} style={{ letterSpacing: 3.8 }}>
          {t({ id: 'onboarding.splash.coverTitle', message: 'CRITTERPASS' })}
        </Text>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            borderWidth: 3.5,
            borderColor: theme.accent.sun,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 28,
              height: 72,
              borderRadius: 14,
              borderWidth: 3,
              borderColor: theme.accent.sun,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 72,
              height: 3,
              backgroundColor: theme.accent.sun,
            }}
          />
        </View>
        <Text variant="badge" color={theme.accent.sun} style={{ letterSpacing: 2.6 }}>
          {t({ id: 'onboarding.splash.coverMark', message: 'PASSPORT · PASSEPORT' })}
        </Text>
      </View>
    </View>
  );
}

export function PremiumSplashPage() {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const actions = useSplashActions();
  const returning = useReturningInstall();
  const tokek = guideFace('tokek');
  if (returning === true) {
    return (
      <WelcomeBack
        onSignIn={actions.signIn}
        onNewPass={actions.open}
        onInviteCode={actions.inviteCode}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="onboarding-splash">
      <View style={{ flex: 1, marginTop: insets.top }} testID="onboarding-stage">
        {FLOATERS.map((floater) => {
          const face = guideFace(floater.id);
          return (
            <View
              key={floater.id}
              pointerEvents="none"
              style={{ position: 'absolute', left: floater.left, top: floater.top, zIndex: 4 }}
            >
              <IdleFloat periodMs={floater.period} delayMs={floater.delay}>
                <CritterSticker
                  kind={face.kind}
                  name={face.name}
                  seed={face.seed}
                  size={floater.size}
                />
              </IdleFloat>
            </View>
          );
        })}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <IdleFloat periodMs={4200} lift={6} sway={1}>
            <View style={{ transform: [{ rotate: tilt(-4) }] }}>
              <Cover />
            </View>
          </IdleFloat>
          <View style={{ position: 'absolute', right: '6%', bottom: '4%', zIndex: 5 }}>
            <View
              style={{
                position: 'absolute',
                right: 70,
                top: -10,
                paddingHorizontal: 12,
                paddingTop: 12,
                paddingBottom: 8,
                backgroundColor: theme.color.banner.guide.bg,
                borderRadius: 4,
                transform: [{ rotate: tilt(7) }],
                boxShadow: theme.shadow.raised,
              }}
            >
              <Text variant="guide" color={theme.color.banner.guide.text}>
                {t({ id: 'onboarding.premium.splash.note', message: 'Hi, I’m\nTokek!' })}
              </Text>
            </View>
            <CritterSticker
              kind={tokek.kind}
              name={tokek.name}
              seed={tokek.seed}
              size={128}
              pose="wave"
            />
          </View>
        </View>
      </View>
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: theme.space.gap14,
        }}
      >
        <Text variant="emptyTitle" align="center" style={{ marginBottom: theme.space.gap10 }}>
          {t({
            id: 'onboarding.splash.tagline',
            message: 'Your pass to every place, and the locals who live there.',
          })}
        </Text>
        <Button
          label={t({ id: 'onboarding.splash.open', message: 'Open your pass' })}
          onPress={actions.open}
          testID="onboarding-open"
        />
        <View style={{ alignItems: 'center' }}>
          <TextButton
            label={t({ id: 'onboarding.splash.invite', message: 'I have an invite code' })}
            onPress={actions.inviteCode}
            testID="onboarding-invite-code"
          />
          <TextButton
            label={t({
              id: 'onboarding.splash.signIn',
              message: 'I already have a pass · Sign in',
            })}
            onPress={actions.signIn}
            testID="onboarding-sign-in"
          />
          {actions.devTools === null ? null : (
            <Pressable
              onPress={actions.devTools}
              testID="dev-tools-entry"
              accessibilityRole="button"
            >
              <Text variant="captionMuted">
                {t({ id: 'onboarding.splash.devTools', message: 'Developer tools' })}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
