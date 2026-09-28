/**
 * 3a-1 Splash: the passport bobs with a sheen across its cover, Tokek hangs off the top edge and
 * pops up every few seconds, and five guides float around it. OPEN YOUR PASS swings the cover open
 * on its spine (3D, ≈1600 perspective, 260 + 420 ms) into page one, with a medium haptic and the
 * page SFX. Everything here is bundled, so a first launch without signal looks the same.
 */
import { t } from '@lingui/core/macro';
import Constants from 'expo-constants';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { upper } from '@cp/i18n';

import { CODE_ENTRY_ROUTE } from '@/lib/links/route-map';
import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion/feedback';
import { useMotionMode } from '@/motion/motion-mode';
import { sheenCycle } from '@/motion/patterns/sheen';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS, type GuideAvatarId } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { ensureDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { PASSPORT_BOB, TOKEK_POP, useOnboardingLoop } from '../motion';

const COVER_W = 240;
const COVER_H = 320;
const SWING_LIFT_MS = 260;
const SWING_OPEN_MS = 420;

/**
 * Where the five floating guides sit around the passport, as fractions of the stage: `y` places a
 * guide's top edge, `bottom` its bottom edge (Paco stands just under the passport and must never
 * reach down into the tagline, whatever the stage height).
 */
const FLOATERS: readonly {
  guide: GuideAvatarId;
  x: number;
  y?: number;
  bottom?: number;
  size: number;
  offset: number;
}[] = [
  { guide: 'pon', x: 0.02, y: 0.06, size: 76, offset: 0 },
  { guide: 'lundi', x: 0.78, y: 0.1, size: 70, offset: 0.2 },
  { guide: 'ajo', x: 0.0, y: 0.6, size: 80, offset: 0.4 },
  { guide: 'sardi', x: 0.8, y: 0.6, size: 64, offset: 0.6 },
  { guide: 'paco', x: 0.42, bottom: 0.01, size: 76, offset: 0.8 },
];

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
  floater: { position: 'absolute' },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['12'],
    alignItems: 'center',
  },
  devTools: { marginTop: th.space['4'] },
}));

function Floater({ guide, x, y, bottom, size, offset }: (typeof FLOATERS)[number]) {
  const styles = useStyles();
  const float = useLoop('float', { offset });
  const info = GUIDE_STICKERS[guide];
  const vertical: ViewStyle =
    bottom === undefined ? { top: `${(y ?? 0) * 100}%` } : { bottom: `${bottom * 100}%` };
  return (
    <Animated.View
      style={[styles.floater, { left: `${x * 100}%` }, vertical, float]}
      testID={`splash-floater-${guide}`}
    >
      <Sticker kind={info.kind} name={info.name} size={size} />
    </Animated.View>
  );
}

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
  const bob = useOnboardingLoop(PASSPORT_BOB);
  const pop = useOnboardingLoop(TOKEK_POP);
  const sheen = useSharedValue(0);
  useEffect(() => {
    // Parked hidden under reduced motion, like every idle loop.
    sheen.value = mode === 'full' ? sheenCycle() : -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const swing = useSharedValue(0);
  const [opening, setOpening] = useState(false);
  const tokek = GUIDE_STICKERS.tokek;

  const goToName = () => {
    ensureDraft();
    router.push(ONBOARDING_ROUTES.name);
  };

  const open = () => {
    if (opening) return;
    setOpening(true);
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id.
    feedback.emit('thud.soft');
    feedback.emit('page');
    if (mode !== 'full') {
      goToName();
      setOpening(false);
      return;
    }
    swing.value = withSequence(
      withTiming(-12, { duration: SWING_LIFT_MS, easing: Easing.out(Easing.quad) }),
      withTiming(-110, { duration: SWING_OPEN_MS, easing: Easing.in(Easing.quad) }, (done) => {
        'worklet';
        if (done) scheduleOnRN(goToName);
      }),
    );
    setTimeout(
      () => {
        swing.value = 0;
        setOpening(false);
      },
      SWING_LIFT_MS + SWING_OPEN_MS + 400,
    );
  };

  // The cover turns on its spine (left edge): shift the pivot there, rotate, shift back.
  const coverStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1600 },
      { translateX: -COVER_W / 2 },
      { rotateY: `${swing.value}deg` },
      { translateX: COVER_W / 2 },
    ],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheen.value < 0 ? 0 : 0.22,
    transform: [
      { translateX: -80 + Math.max(0, sheen.value) * (COVER_W + 160) },
      { rotate: degrees(12) },
    ],
  }));

  return (
    <Scaffold
      variant="dark"
      edges={['top', 'bottom']}
      background={<Halftone variant="dark" />}
      testID="onboarding-splash"
    >
      <View style={styles.stage}>
        {FLOATERS.map((floater) => (
          <Floater key={floater.guide} {...floater} />
        ))}
        <Animated.View style={bob}>
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
          <Animated.View style={[styles.tokek, pop]}>
            <Sticker kind={tokek.kind} name={tokek.name} size={84} />
          </Animated.View>
        </Animated.View>
      </View>
      <View style={styles.footer}>
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
        <InlineAction
          label={t({ id: 'onboarding.splash.invite', message: 'I have an invite code' })}
          onPress={() => router.push(CODE_ENTRY_ROUTE)}
          testID="onboarding-invite-code"
        />
        <InlineAction
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
      </View>
    </Scaffold>
  );
}
