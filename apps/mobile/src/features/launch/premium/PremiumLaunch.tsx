/**
 * The first launch (10.02): the native launch screen's passport cover gets the ISSUED stamp (it
 * falls, squashes the cover, inks, and bursts confetti with a heavy thud), then the cover lifts on
 * the Smooth spring while Tokek, the plane and the puffin pop in on the Lively one and the glow
 * fades to show the welcome screen (2.01) underneath. Its first frame is the launch screen itself:
 * the same glow and cover images at the same centred geometry. It plays once per phone; every later
 * cold start renders nothing. Never takes a touch, hidden from assistive tech (the welcome screen
 * carries the meaning). Reduce Motion: the stamp fades in, the cover cross-fades to its lifted
 * place, no confetti; the haptic and the thud stay.
 *
 * Hand-off: when everything has landed it calls `onSettled` with the cover's resting frame, where
 * the welcome screen draws its own cover; then it fades out, or with `holdCover` keeps the cover
 * and stickers until the parent stops rendering it.
 */
import { useLingui } from '@lingui/react';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { premium } from '@cp/design-tokens';

import { impact } from '@/motion/feedback';
import { REDUCED_FADE, REDUCED_FADE_MS, SPRINGS, usePremiumReducedMotion } from '@/ui/premium';

import COVER_DARK from '../../../../assets/launch/cover-dark.png';
import COVER_LIGHT from '../../../../assets/launch/cover.png';
import GLOW_DARK from '../../../../assets/launch/glow-dark.png';
import GLOW_LIGHT from '../../../../assets/launch/glow.png';
import STICKER_PLANE from '../../../../assets/launch/sticker-plane.png';
import STICKER_PUFFIN from '../../../../assets/launch/sticker-puffin.png';
import STICKER_TOKEK from '../../../../assets/launch/sticker-tokek.png';
import { IssuedStamp } from './IssuedStamp';
import { LaunchConfetti } from './LaunchConfetti';
import { finishPremiumLaunch, issuedAt, premiumLaunchPending } from './launch-state';
import {
  CONFETTI,
  COVER,
  COVER_LIFT,
  COVER_SQUASH,
  GLOW_SIZE,
  STAMP,
  STICKERS,
  STICKER_PAD,
  beatAt,
  launchCoverFinalFrame,
  stampDateLabel,
  stickerOrigin,
  type LaunchCoverFrame,
  type LaunchSticker,
  type LaunchStickerName,
} from './launch-timeline';

/**
 * The launch grounds behind the glow (app.config.ts LAUNCH_GROUND): the light ground token, and
 * the design's ink launch ground in dark (10.03), which is the light ink colour.
 */
const GROUND = { light: premium.modes.light.color.ground, dark: premium.modes.light.color.ink };
const STICKER_ART: Record<LaunchStickerName, number> = {
  tokek: STICKER_TOKEK,
  plane: STICKER_PLANE,
  puffin: STICKER_PUFFIN,
};
const STAMP_DROP_MS = beatAt('stampHit') - beatAt('stampDrop');
const SQUASH_IN_MS = beatAt('squashDeep') - beatAt('squashStart');
const SQUASH_OUT_MS = beatAt('squashEnd') - beatAt('squashDeep');
const GROUND_FADE_MS = beatAt('liftEnd') - beatAt('lift');
const OVERLAY_FADE_MS = REDUCED_FADE_MS;
/** Sets a value on the next frame (a `withDelay` step with no motion). */
// eslint-disable-next-line critterpass/no-literal-style -- a step, not a motion: no duration token.
const AT_ONCE = { duration: 0 };

/** `from` at 0, `to` at 1, straight between (and beyond, for springs that overshoot). */
function mix(t: number, from: number, to: number): number {
  'worklet';
  return from + (to - from) * t;
}

export interface PremiumLaunchProps {
  /** True once the root layout has hidden the native launch screen. */
  readonly revealed: boolean;
  /** Everything has landed: the welcome screen draws its cover at `cover` from now on. */
  readonly onSettled?: (cover: LaunchCoverFrame) => void;
  /** Keep the cover and stickers after settling, until the parent stops rendering this. */
  readonly holdCover?: boolean;
  /** The overlay has faded out (not called with `holdCover`). */
  readonly onDone?: () => void;
}

/** Mounted once at the app root, above the screens; renders nothing after the first launch. */
export function PremiumLaunch({
  revealed,
  onSettled,
  holdCover = false,
  onDone,
}: PremiumLaunchProps) {
  const [playing, setPlaying] = useState(premiumLaunchPending);
  if (!playing) return null;
  return (
    <LaunchStage
      revealed={revealed}
      holdCover={holdCover}
      onSettled={(cover) => {
        finishPremiumLaunch();
        onSettled?.(cover);
      }}
      onFaded={() => {
        setPlaying(false);
        onDone?.();
      }}
    />
  );
}

interface LaunchStageProps {
  readonly revealed: boolean;
  readonly holdCover: boolean;
  readonly onSettled: (cover: LaunchCoverFrame) => void;
  readonly onFaded: () => void;
}

function LaunchStage({ revealed, holdCover, onSettled, onFaded }: LaunchStageProps) {
  const screen = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  const reduced = usePremiumReducedMotion();
  const { i18n } = useLingui();
  const [confettiFired, setConfettiFired] = useState(false);
  const started = useRef(false);

  const stampIn = useSharedValue(0);
  const stampDrop = useSharedValue(0);
  const stampSettle = useSharedValue(0);
  const squash = useSharedValue(0);
  const lift = useSharedValue(0);
  const coverOpacity = useSharedValue(1);
  const groundOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);
  const tokek = useSharedValue(0);
  const plane = useSharedValue(0);
  const puffin = useSharedValue(0);
  const clockOf = (name: LaunchStickerName): SharedValue<number> =>
    name === 'tokek' ? tokek : name === 'plane' ? plane : puffin;

  useEffect(() => {
    if (!revealed || started.current) return undefined;
    started.current = true;
    const at = beatAt;
    const fade = REDUCED_FADE;
    if (reduced) {
      stampDrop.value = 1;
      stampSettle.value = 1;
      stampIn.value = withDelay(at('stampDrop'), withTiming(1, fade));
      coverOpacity.value = withDelay(
        at('lift'),
        withSequence(withTiming(0, fade), withTiming(1, fade)),
      );
      lift.value = withDelay(at('lift') + REDUCED_FADE_MS, withTiming(1, AT_ONCE));
      for (const sticker of STICKERS) {
        clockOf(sticker.name).value = withDelay(at(sticker.beat), withTiming(1, fade));
      }
    } else {
      stampIn.value = withDelay(at('stampDrop'), withTiming(1, AT_ONCE));
      stampDrop.value = withDelay(
        at('stampDrop'),
        withTiming(1, { duration: STAMP_DROP_MS, easing: Easing.bezier(0.55, 0, 1, 0.45) }),
      );
      stampSettle.value = withDelay(at('stampHit'), withSpring(1, SPRINGS.lively));
      squash.value = withDelay(
        at('squashStart'),
        withSequence(
          withTiming(1, { duration: SQUASH_IN_MS }),
          withTiming(0, { duration: SQUASH_OUT_MS }),
        ),
      );
      lift.value = withDelay(at('lift'), withSpring(1, SPRINGS.smooth));
      for (const sticker of STICKERS) {
        clockOf(sticker.name).value = withDelay(at(sticker.beat), withSpring(1, SPRINGS.lively));
      }
    }
    groundOpacity.value = withDelay(at('lift'), withTiming(0, { duration: GROUND_FADE_MS }));
    const timers = [
      setTimeout(() => {
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a feedback cue id, never copy.
        impact('thud.heavy');
        if (!reduced) setConfettiFired(true);
      }, at('stampHit')),
      setTimeout(() => {
        onSettled(launchCoverFinalFrame(screen));
        if (holdCover) return;
        overlayOpacity.value = withTiming(0, { duration: OVERLAY_FADE_MS });
      }, at('settled')),
    ];
    if (!holdCover) timers.push(setTimeout(onFaded, at('settled') + OVERLAY_FADE_MS));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per reveal; the plan is fixed.
  }, [revealed]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const groundStyle = useAnimatedStyle(() => ({ opacity: groundOpacity.value }));
  const coverStyle = useAnimatedStyle(() => {
    const s = squash.value;
    const l = lift.value;
    const liftScale = mix(l, 1, COVER_LIFT.scale);
    return {
      opacity: coverOpacity.value,
      transform: [
        { translateY: s * COVER_SQUASH.translateY + l * COVER_LIFT.translateY },
        { rotate: `${l * COVER_LIFT.rotate}deg` },
        { scaleX: mix(s, 1, COVER_SQUASH.scaleX) * liftScale },
        { scaleY: mix(s, 1, COVER_SQUASH.scaleY) * liftScale },
      ],
    };
  });
  const stampStyle = useAnimatedStyle(() => {
    const d = stampDrop.value;
    const s = stampSettle.value;
    const fall = (to: number) => {
      'worklet';
      return mix(d, STAMP.from.scale, to);
    };
    return {
      opacity: stampIn.value,
      transform: [
        { translateY: mix(d, STAMP.from.translateY, 0) },
        { rotate: `${mix(d, STAMP.from.rotate, STAMP.rotate)}deg` },
        { scaleX: mix(s, fall(STAMP.impact.scaleX), 1) },
        { scaleY: mix(s, fall(STAMP.impact.scaleY), 1) },
      ],
    };
  });

  const centre = { x: screen.width / 2, y: screen.height / 2 };
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, overlayStyle]}
      testID="premium-launch"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: dark ? GROUND.dark : GROUND.light },
          groundStyle,
        ]}
      >
        <Image
          source={dark ? GLOW_DARK : GLOW_LIGHT}
          fadeDuration={0}
          style={[styles.glow, { left: centre.x - GLOW_SIZE / 2, top: centre.y - GLOW_SIZE / 2 }]}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.cover,
          { left: centre.x - COVER.width / 2, top: centre.y - COVER.height / 2 },
          coverStyle,
        ]}
      >
        <Image
          source={dark ? COVER_DARK : COVER_LIGHT}
          fadeDuration={0}
          style={styles.coverImage}
        />
        <Animated.View style={[styles.stamp, stampStyle]}>
          <IssuedStamp date={stampDateLabel(issuedAt(), i18n.locale)} />
        </Animated.View>
      </Animated.View>
      <LaunchConfetti
        x={screen.width * CONFETTI.originX}
        y={screen.height * CONFETTI.originY}
        count={CONFETTI.count}
        fired={confettiFired}
      />
      {STICKERS.map((sticker) => (
        <PoppingSticker
          key={sticker.name}
          sticker={sticker}
          origin={stickerOrigin(sticker, screen)}
          clock={clockOf(sticker.name)}
        />
      ))}
    </Animated.View>
  );
}

interface PoppingStickerProps {
  readonly sticker: LaunchSticker;
  readonly origin: { x: number; y: number };
  readonly clock: SharedValue<number>;
}

function PoppingSticker({ sticker, origin, clock }: PoppingStickerProps) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, clock.value * 4)),
    transform: [
      { rotate: `${mix(clock.value, sticker.fromRotate, sticker.rotate)}deg` },
      { scale: clock.value },
    ],
  }));
  const box = sticker.size + STICKER_PAD * 2;
  return (
    <Animated.View
      style={[
        styles.sticker,
        { left: origin.x - STICKER_PAD, top: origin.y - STICKER_PAD, width: box, height: box },
        style,
      ]}
    >
      <Image
        source={STICKER_ART[sticker.name]}
        fadeDuration={0}
        style={{ width: box, height: box }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', width: GLOW_SIZE, height: GLOW_SIZE },
  cover: { position: 'absolute', width: COVER.width, height: COVER.height },
  coverImage: {
    position: 'absolute',
    left: -COVER.imagePad,
    top: -COVER.imagePad,
    width: COVER.width + COVER.imagePad * 2,
    height: COVER.height + COVER.imagePad * 2,
  },
  stamp: { position: 'absolute', left: STAMP.left, top: STAMP.top },
  sticker: { position: 'absolute' },
});
