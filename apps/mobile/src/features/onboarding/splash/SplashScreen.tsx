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
import { useMotionMode } from '@/motion/motion-mode';
import { sheenCycle } from '@/motion/patterns/sheen';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { ensureDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { PASSPORT_BOB, TOKEK_POP, useOnboardingLoop } from '../motion';
import { FLOATERS, Floater } from './Floaters';
import {
  COVER_H,
  COVER_W,
  coverFrame,
  nameCardFrame,
  usePassportOpening,
  type Frame,
} from './passport-opening';

const useStyles = makeStyles((th) => ({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: {
    width: COVER_W,
    height: COVER_H,
    borderRadius: 18,
    backgroundColor: th.color.orange,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 36,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: th.color.yellow,
  },
  globe: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: th.color.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeLat: { position: 'absolute', width: 96, height: 4, backgroundColor: th.color.yellow },
  globeLng: {
    width: 44,
    height: 88,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: th.color.yellow,
  },
  sheen: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 60,
    backgroundColor: th.color.paper.base,
  },
  tokek: { position: 'absolute', top: -58, alignSelf: 'center' },
  page: {
    position: 'absolute',
    backgroundColor: th.color.paper.base,
  },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['12'],
    alignItems: 'center',
  },
  devTools: { marginTop: th.space['4'] },
}));

function readAppVariant(): string {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return typeof raw === 'string' ? raw : 'development';
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never rendered copy.
const DEV_TOOLS_ROUTE = '/(dev)';
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never rendered copy.
const RETURNING_SIGN_IN = `${ONBOARDING_ROUTES.phone}?mode=returning`;

export function SplashScreen() {
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
  useEffect(() => {
    // Parked hidden under reduced motion, like every idle loop.
    sheen.value = mode === 'full' ? sheenCycle() : -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // One opening per visit: a second tap mid-swing does nothing; the splash coming back re-arms it.
  const opening = useRef(false);
  useEffect(() => {
    if (focused) opening.current = false;
  }, [focused]);
  const [stage, setStage] = useState<Frame | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const tokek = GUIDE_STICKERS.tokek;

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
    passport.start(goToName);
  };

  // The cover turns on its spine (left edge): shift the pivot there, rotate, shift back. Edge-on
  // it is gone, so its back never shows.
  const coverStyle = useAnimatedStyle(() => ({
    opacity: passport.swing.value <= -89 ? 0 : 1,
    transform: [
      { perspective: 1600 },
      { translateX: -COVER_W / 2 },
      { rotateY: `${passport.swing.value}deg` },
      { translateX: COVER_W / 2 },
    ],
  }));
  // The page under the cover, from the cover's frame to page one's card (both in the page body).
  const from = stage === null ? null : coverFrame(stage);
  const to = nameCardFrame(bodyWidth);
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
    <Scaffold
      variant="dark"
      edges={['top', 'bottom']}
      background={<Halftone variant="dark" />}
      testID="onboarding-splash"
    >
      <View style={styles.stage} onLayout={onStageLayout} testID="onboarding-stage">
        <Animated.View style={[StyleSheet.absoluteFill, chromeStyle]} pointerEvents="none">
          {FLOATERS.map((floater) => (
            <Floater key={floater.guide} {...floater} />
          ))}
        </Animated.View>
        <Animated.View style={bob}>
          <Animated.View
            style={[styles.page, pageStyle]}
            pointerEvents="none"
            testID="onboarding-first-page"
          />
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
          <Animated.View style={[styles.tokek, pop, chromeStyle]}>
            <Sticker kind={tokek.kind} name={tokek.name} size={84} />
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
          label={t({ id: 'onboarding.splash.signIn', message: 'I already have a pass · Sign in' })}
          onPress={() => router.push(RETURNING_SIGN_IN)}
          testID="onboarding-sign-in"
        />
        {readAppVariant() !== 'production' ? (
          // Never in production: the (dev) group is dropped from a production export
          // (tools/scripts/check-release-bundle.ts), so this entry stays hidden there too.
          <Link href={DEV_TOOLS_ROUTE} asChild>
            <Pressable testID="dev-tools-entry" style={styles.devTools}>
              <Text variant="caption" color={theme.semantic.text.tertiary}>
                {upper(t({ id: 'onboarding.splash.devTools', message: 'Developer tools' }), locale)}
              </Text>
            </Pressable>
          </Link>
        ) : null}
      </Animated.View>
    </Scaffold>
  );
}
