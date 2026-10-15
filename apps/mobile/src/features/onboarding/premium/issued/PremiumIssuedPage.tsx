/**
 * 2.11 "Your pass is ready": the paper pass drops in (Smooth), ISSUED slams onto it (the 1.07
 * landing, its thud and haptic), HOME lands 300 ms later, and Tokek hops in. Offline the number is
 * the placeholder with SYNCING until the server's arrives. The save sheet (2.12) rises over this
 * same page; once saved, the page leads on instead of offering to save.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { useNoBackByDesign } from '@/lib/qa/back-affordance';
import {
  Button,
  CritterSticker,
  REDUCED_FADE_MS,
  RoundStamp,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { ONBOARDING_ROUTES } from '../../flow-controller/steps';
import { guideFacts } from '../../guide-faces';
import { useHoldBack, useIssuedArrival, useIssuedPass } from '../../issued/use-issued-step';
import { passFacts } from '../../pass-facts';
import { PassPaper } from '../components/PassPaper';
import { StampLanding } from '../components/StampLanding';
import { tilt } from '../components/tilt';

const ISSUED_AT_MS = 700;
const HOME_AT_MS = 1000;

export interface PremiumIssuedViewProps {
  readonly choreography: boolean;
  readonly footer?: ReactNode;
}

export function PremiumIssuedView({ choreography, footer }: PremiumIssuedViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const reduced = usePremiumReducedMotion();
  const pass = useIssuedPass();
  const facts = passFacts(pass.draft, locale, pass.home === null ? 0 : 1);
  const tokek = guideFacts('tokek');
  const drop = useSharedValue(choreography ? 0 : 1);
  useEffect(() => {
    if (!choreography) return;
    drop.value = reduced
      ? withTiming(1, { duration: REDUCED_FADE_MS })
      : withSpring(1, SPRINGS.smooth);
    // The arrival plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sparkles = {
    star: t({ id: 'onboarding.premium.issued.star', message: 'Star' }),
    spark: t({ id: 'onboarding.premium.issued.spark', message: 'Sparkle' }),
  };
  const passStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: (1 - drop.value) * -40 }],
  }));
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="onboarding-issued">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 38,
          paddingHorizontal: 22,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        <Animated.View style={passStyle}>
          <PassPaper facts={facts} size="issued" rotate={-2} syncing={pass.syncing}>
            <View pointerEvents="none" style={{ position: 'absolute', right: 30, bottom: -30 }}>
              <StampLanding delayMs={ISSUED_AT_MS} play={choreography}>
                <RoundStamp
                  word={t({ id: 'onboarding.issued.stamp', message: 'Issued' })}
                  top={t({ id: 'onboarding.splash.coverTitle', message: 'CRITTERPASS' })}
                  {...(facts.issued === null ? {} : { bottom: facts.issued })}
                  ink="pink"
                  size={122}
                  rotate={-14}
                  testID="issued-stamp"
                />
              </StampLanding>
            </View>
            {facts.homeCode === null ? null : (
              <View pointerEvents="none" style={{ position: 'absolute', left: 128, bottom: -40 }}>
                <StampLanding delayMs={HOME_AT_MS} play={choreography}>
                  <RoundStamp
                    word={facts.homeCode}
                    top={t({ id: 'onboarding.home.stampHome', message: 'Home' })}
                    ink="orange"
                    size={84}
                    rotate={10}
                    testID="home-stamp-issued"
                  />
                </StampLanding>
              </View>
            )}
          </PassPaper>
        </Animated.View>
        <View style={{ marginTop: 40, flexDirection: 'row', alignItems: 'flex-end' }}>
          <CritterSticker kind={tokek.kind} name={tokek.name} size={112} pose="cheer" />
          {/* The sparkles round Tokek (2.11): a pink star and a sun spark. */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 2, top: 32, transform: [{ rotate: tilt(16) }] }}
          >
            <CritterSticker kind="star" name={sparkles.star} size={26} />
          </View>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 120, top: 68, transform: [{ rotate: tilt(-10) }] }}
          >
            <CritterSticker kind="spark" name={sparkles.spark} size={30} />
          </View>
        </View>
        <View style={{ gap: theme.space.gap8 }}>
          <Text variant="display" accessibilityRole="header">
            {t({ id: 'onboarding.premium.issued.title', message: 'Your pass is ready' })}
          </Text>
          <Text variant="headline" tone="muted" style={{ fontWeight: '400' }}>
            {t({
              id: 'onboarding.issued.body',
              message: 'One stamp so far. The guides will help with the rest.',
            })}
          </Text>
          {pass.saved ? (
            <Text variant="label" color={theme.color.status.booked.text} testID="pass-saved-tick">
              {t({ id: 'onboarding.saved', message: 'Saved ✓' })}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {footer === undefined ? null : (
        <View
          style={{
            paddingHorizontal: theme.space.titleGutter,
            paddingBottom: Math.max(insets.bottom, theme.space.gap16) + 24,
            gap: theme.space.gap12,
            alignItems: 'center',
          }}
        >
          {footer}
        </View>
      )}
    </View>
  );
}

export function PremiumIssuedPage() {
  // Onboarding is done and is not re-entered: the pass draws no back, and Android's back is held.
  useNoBackByDesign();
  useHoldBack();
  const choreography = useIssuedArrival();
  const pass = useIssuedPass();
  return (
    <PremiumIssuedView
      choreography={choreography}
      footer={
        pass.saved ? (
          <Button
            label={t({ id: 'onboarding.name.next', message: 'Next' })}
            onPress={() => router.push(ONBOARDING_ROUTES.permissions)}
            testID="onboarding-issued-next"
          />
        ) : (
          <>
            <Button
              label={t({ id: 'onboarding.issued.save', message: 'Save my pass' })}
              onPress={() => router.push(ONBOARDING_ROUTES.save)}
              testID="onboarding-issued-save"
            />
            <Text variant="label" tone="muted" style={{ fontWeight: '400' }}>
              {t({ id: 'onboarding.issued.saveNote', message: 'Takes ten seconds. No password.' })}
            </Text>
          </>
        )
      }
    />
  );
}
