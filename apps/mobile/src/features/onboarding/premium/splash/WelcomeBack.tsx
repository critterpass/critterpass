/**
 * 2.02 the splash for a phone that held a saved pass before (a reinstall): the navy passport,
 * "Welcome back", and sign-in first. Without signal a NO SIGNAL chip says so; Sign in waits for
 * signal and goes on by itself when it returns, and a new pass can still be made offline (it
 * syncs later). An invite code is the third way in.
 */
import { t } from '@lingui/core/macro';
import { useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { Button, CritterSticker, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { guideFace } from '../../photo/use-photo-step';
import { IdleFloat } from '../components/IdleFloat';
import { NAVY_PASS } from '../components/onboarding-colours';
import { tilt } from '../components/tilt';

/** Signal as the app's network source reports it; online when there is no source yet. */
function useSignal(): boolean {
  const network = useContext(LocalFirstContext)?.network ?? null;
  const [online, setOnline] = useState(() => network?.isOnline() ?? true);
  useEffect(() => (network === null ? undefined : network.subscribe(setOnline)), [network]);
  return online;
}

function NavyPassport() {
  const tokek = guideFace('tokek');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t({ id: 'onboarding.splash.coverTitle', message: 'CRITTERPASS' })}
      style={{
        width: 200,
        height: 262,
        borderTopLeftRadius: 12,
        borderBottomLeftRadius: 12,
        borderTopRightRadius: 18,
        borderBottomRightRadius: 18,
        experimental_backgroundImage: NAVY_PASS.cover,
        boxShadow: NAVY_PASS.shadow,
        alignItems: 'center',
        paddingVertical: 30,
        justifyContent: 'space-between',
      }}
    >
      <Text variant="mono" color={NAVY_PASS.gold} style={{ letterSpacing: 3 }}>
        {t({ id: 'onboarding.premium.welcomeBack.passport', message: 'PASSPORT' })}
      </Text>
      <View
        style={{
          width: 92,
          height: 92,
          borderRadius: 46,
          borderWidth: 2,
          borderColor: NAVY_PASS.gold,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CritterSticker kind={tokek.kind} name={tokek.name} seed={tokek.seed} size={70} />
      </View>
      <Text variant="guide" color={NAVY_PASS.gold}>
        CritterPass
      </Text>
    </View>
  );
}

export function WelcomeBack({
  onSignIn,
  onNewPass,
  onInviteCode,
}: {
  readonly onSignIn: () => void;
  readonly onNewPass: () => void;
  readonly onInviteCode: () => void;
}) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const online = useSignal();
  const [waiting, setWaiting] = useState(false);
  // Sign in asked for while offline goes on by itself once signal is back.
  useEffect(() => {
    if (waiting && online) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- signal came back: the one wait ends.
      setWaiting(false);
      onSignIn();
    }
  }, [waiting, online, onSignIn]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.ground,
        experimental_backgroundImage: NAVY_PASS.ground(theme.color.ground),
      }}
      testID="onboarding-welcome-back"
    >
      <View style={{ flex: 1, marginTop: insets.top, alignItems: 'center' }}>
        {online ? null : (
          <View
            style={{
              marginTop: 16,
              height: 30,
              paddingHorizontal: 11,
              borderRadius: 15,
              backgroundColor: theme.color.segmentTrack,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
            testID="onboarding-no-signal"
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: theme.accent.tangerine,
              }}
            />
            <Text variant="badge" color={theme.color.status.tangerine.text}>
              {t({ id: 'onboarding.premium.welcomeBack.noSignal', message: 'NO SIGNAL' })}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <IdleFloat periodMs={5200} lift={8} sway={2}>
            <View style={{ transform: [{ rotate: tilt(-4) }] }}>
              <NavyPassport />
            </View>
          </IdleFloat>
        </View>
      </View>
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingBottom: Math.max(insets.bottom, 16) + 14,
          gap: theme.space.gap10,
        }}
      >
        <View style={{ gap: theme.space.gap8, marginBottom: theme.space.gap10 }}>
          <Text variant="largeTitle" align="center" accessibilityRole="header">
            {t({ id: 'onboarding.premium.welcomeBack.title', message: 'Welcome back' })}
          </Text>
          <Text variant="body" tone="muted" align="center">
            {online
              ? t({
                  id: 'onboarding.premium.welcomeBack.body',
                  message: 'Your pass is waiting in your account. Sign in to pick it up.',
                })
              : t({
                  id: 'onboarding.premium.welcomeBack.bodyOffline',
                  message: 'Sign in when you have signal, or make a new pass now. It syncs later.',
                })}
          </Text>
        </View>
        <Button
          label={t({ id: 'onboarding.premium.welcomeBack.signIn', message: 'Sign in' })}
          onPress={() => (online ? onSignIn() : setWaiting(true))}
          testID="onboarding-sign-in"
        />
        {waiting ? (
          <Text variant="caption" tone="muted" align="center" testID="onboarding-sign-in-waiting">
            {t({
              id: 'onboarding.premium.welcomeBack.waiting',
              message: 'Needs signal. I’ll sign you in when you’re back.',
            })}
          </Text>
        ) : null}
        <Button
          label={
            online
              ? t({ id: 'onboarding.premium.welcomeBack.newPass', message: 'Make a new pass' })
              : t({
                  id: 'onboarding.premium.welcomeBack.newPassOffline',
                  message: 'Make a new pass offline',
                })
          }
          variant="secondary"
          onPress={onNewPass}
          testID="onboarding-open"
        />
        <View style={{ alignItems: 'center' }}>
          <TextButton
            align="center"
            label={t({ id: 'onboarding.splash.invite', message: 'I have an invite code' })}
            onPress={onInviteCode}
            testID="onboarding-invite-code"
          />
        </View>
      </View>
    </View>
  );
}
