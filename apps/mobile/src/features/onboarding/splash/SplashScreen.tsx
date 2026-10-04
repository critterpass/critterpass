/**
 * 3a-1 Splash: the passport bobs with a sheen across its cover, Tokek hangs off the top edge and
 * pops up every few seconds, and five guides float around it. OPEN YOUR PASS swings the cover open
 * on its spine (3D, 1600 perspective) and the paper page under it grows into page one's pass card
 * (./passport-opening.ts), with a soft thud and the page SFX. Everything here is bundled, so a
 * first launch without signal looks the same.
 */
import { t } from '@lingui/core/macro';
import Constants from 'expo-constants';
import { Link, router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LayoutRectangle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { CODE_ENTRY_ROUTE } from '@/lib/links/route-map';
import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion/feedback';
import { useIdleLoopRunning } from '@/motion/idle-pause';
import { useMotionMode } from '@/motion/motion-mode';
import { sheenCycle } from '@/motion/patterns/sheen';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { degrees, useTheme } from '@/ui/theme';

import type { PassDraft } from '@cp/domain';

import { ensureDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { PASSPORT_BOB, TOKEK_POP, useOnboardingLoop } from '../motion';
import { OnboardingPassCard } from '../pass-view';
import { FirstHatch, firstHatchPending } from '../hatch/LaunchHatch';
import { FloaterField } from './Floaters';
import { useSplashStyles as useStyles } from './splash-styles';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import {
  COVER_H,
  COVER_W,
  coverFrame,
  nameCardFrame,
  usePassportOpening,
  type Frame,
} from './passport-opening';

function readAppVariant(): string {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return typeof raw === 'string' ? raw : 'development';
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never rendered copy.
const DEV_TOOLS_ROUTE = '/(dev)';
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never rendered copy.
const RETURNING_SIGN_IN = `${ONBOARDING_ROUTES.phone}?mode=returning`;

export function SplashScreen() {
  // The first screen of the app: there is nothing to go back to.
  useNoBackByDesign();
  useTrackStep('splash');
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [mode] = useMotionMode();
  const focused = useIsFocused();
  const passport = usePassportOpening(focused);
  const bob = useOnboardingLoop(PASSPORT_BOB, 0, passport.settle);
  const pop = useOnboardingLoop(TOKEK_POP);
  const sheen = useSharedValue(0);
  const sheenRunning = useIdleLoopRunning(mode === 'full');
  useEffect(() => {
    // Parked hidden under reduced motion, like every idle loop; parked at rest once it stops.
    sheen.value = mode !== 'full' ? -1 : sheenRunning ? sheenCycle() : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sheenRunning]);
  // One opening per visit: a second tap mid-swing does nothing; the splash coming back re-arms it.
  const opening = useRef(false);
  const [printed, setPrinted] = useState<PassDraft | null>(null);
  useEffect(() => {
    if (focused) opening.current = false;
  }, [focused]);
  const [stage, setStage] = useState<Frame | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const tokek = guideSticker('tokek');
  // The first launch opens on the hatch; the floaters slap on as it fades.
  const [hatching, setHatching] = useState(firstHatchPending);

  const goToName = () => {
    ensureDraft();
    router.push(ONBOARDING_ROUTES.name);
  };

  const open = () => {
    if (opening.current) return;
    opening.current = true;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id.
    feedback.emit('thud.soft');
    feedback.emit('page');
    if (mode !== 'full' || stage === null) {
      goToName();
      return;
    }
    // Page one's card, printed on the page as it lands, so the page is never bare while the
    // name page mounts.
    setPrinted(ensureDraft());
    passport.start(goToName);
  };

  // The cover turns on its spine (left edge): shift the pivot there, rotate, shift back. It fades
  // over its last 30°, so no edge-on sliver lingers over the page and its back never shows.
  const coverStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (passport.swing.value + 90) / 30)),
    transform: [
      { perspective: 1600 },
      { translateX: -COVER_W / 2 },
      { rotateY: `${passport.swing.value}deg` },
      { translateX: COVER_W / 2 },
    ],
  }));
  // The page under the cover, from the cover's frame to page one's card (both in the page body).
  const from = stage === null ? null : coverFrame(stage);
  const to = nameCardFrame(bodyWidth, stage?.y ?? 0);
  const pageStyle = useAnimatedStyle(() => {
    const g = passport.grow.value;
    if (from === null) return { width: COVER_W, height: COVER_H, borderRadius: 18 };
    return {
      left: (to.x - from.x) * g,
      top: (to.y - from.y) * g,
      width: COVER_W + (to.width - COVER_W) * g,
      height: COVER_H + (to.height - COVER_H) * g,
      borderRadius: 18 + (theme.radius.lg - 18) * g,
    };
  });
  const chromeStyle = useAnimatedStyle(() => ({ opacity: passport.chrome.value }));
  // The card prints over the last 40% of the page's travel.
  const printStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (passport.grow.value - 0.6) / 0.4)),
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheen.value < 0 ? 0 : 0.22,
    transform: [
      { translateX: -80 + Math.max(0, sheen.value) * (COVER_W + 160) },
      { rotate: degrees(12) },
    ],
  }));

  const onStageLayout = ({ nativeEvent }: { nativeEvent: { layout: LayoutRectangle } }) => {
    const { x, y, width, height } = nativeEvent.layout;
    setStage({ x, y, width, height });
    setBodyWidth(width);
  };

  return (
    <>
      <Scaffold
        variant="dark"
        edges={['top', 'bottom']}
        background={<Halftone variant="dark" />}
        testID="onboarding-splash"
      >
        <View style={styles.stage} onLayout={onStageLayout} testID="onboarding-stage">
          <Animated.View style={[StyleSheet.absoluteFill, chromeStyle]} pointerEvents="none">
            <FloaterField waiting={hatching} />
          </Animated.View>
          <Animated.View style={bob}>
            <Animated.View
              style={[styles.page, pageStyle]}
              pointerEvents="none"
              testID="onboarding-first-page"
            >
              {printed === null ? null : (
                <Animated.View style={[{ width: to.width }, printStyle]}>
                  <OnboardingPassCard draft={printed} />
                </Animated.View>
              )}
            </Animated.View>
            <Animated.View style={coverStyle} testID="onboarding-cover">
              <View
                style={styles.cover}
                accessible
                accessibilityRole="image"
                accessibilityLabel={t({
                  id: 'onboarding.splash.cover',
                  message: 'Your CritterPass passport',
                })}
              >
                <Text variant="eyebrow" color={theme.color.yellow}>
                  {t({ id: 'onboarding.splash.coverTitle', message: 'CRITTERPASS' })}
                </Text>
                <View style={styles.globe}>
                  <View style={styles.globeLat} />
                  <View style={styles.globeLng} />
                </View>
                <Text variant="eyebrow" color={theme.color.yellow}>
                  {t({ id: 'onboarding.splash.coverMark', message: 'PASSPORT · PASSEPORT' })}
                </Text>
                <Animated.View style={[styles.sheen, sheenStyle]} pointerEvents="none" />
              </View>
            </Animated.View>
            {/* Fading and popping are two animated styles on two views: on one they fight over opacity. */}
            <Animated.View style={[styles.tokek, chromeStyle]}>
              <Animated.View style={pop}>
                <Sticker kind={tokek.kind} name={tokek.name} size={84} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </View>
        <Animated.View style={[styles.footer, chromeStyle]}>
          <Text variant="bodyLg" style={{ textAlign: 'center' }}>
            {t({
              id: 'onboarding.splash.tagline',
              message: 'Your pass to every place, and the locals who live there.',
            })}
          </Text>
          <PillButton
            label={t({ id: 'onboarding.splash.open', message: 'Open your pass' })}
            onPress={open}
            sheen
            testID="onboarding-open"
          />
          <TextLink
            label={t({ id: 'onboarding.splash.invite', message: 'I have an invite code' })}
            onPress={() => router.push(CODE_ENTRY_ROUTE)}
            testID="onboarding-invite-code"
          />
          <TextLink
            label={t({
              id: 'onboarding.splash.signIn',
              message: 'I already have a pass · Sign in',
            })}
            onPress={() => router.push(RETURNING_SIGN_IN)}
            testID="onboarding-sign-in"
          />
          {readAppVariant() !== 'production' ? (
            // Never in production: the (dev) group is dropped from a production export
            // (tools/scripts/check-release-bundle.ts), so this entry stays hidden there too.
            <Link href={DEV_TOOLS_ROUTE} asChild>
              <Pressable testID="dev-tools-entry" style={styles.devTools}>
                <Text variant="caption" color={theme.semantic.text.tertiary}>
                  {upper(
                    t({ id: 'onboarding.splash.devTools', message: 'Developer tools' }),
                    locale,
                  )}
                </Text>
              </Pressable>
            </Link>
          ) : null}
        </Animated.View>
      </Scaffold>
      {hatching ? <FirstHatch onDone={() => setHatching(false)} /> : null}
    </>
  );
}
