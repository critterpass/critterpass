/**
 * The winner stamp (4.06, Foundations 1.07): a white disc holding a tilted double-ring stamp in
 * orange ink with the crew's line, the place and the score. When it plays, the disc scales in on
 * Smooth, the stamp falls from above, big and turned, squashes on impact and settles on Lively with
 * a heavy haptic; stickers pop in after it. Reduce Motion fades it in (the stamp still lands, with no
 * fall); a result opened again is drawn finished.
 */
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  CritterSticker,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

/** The disc, the ring inside it and the ring's tilt (design: 250, 214, −9°). */
const DISC = 250;
const RING = 214;
const RING_TILT = -9;
/** The double ring: a 4 pt outer band and a hairline band 6 pt inside it. */
const OUTER_BAND = 4;
const INNER_AT = 10;
const INNER_BAND = 1.5;
/** The guide's sticker hops over the disc's lower edge. */
const GUIDE = 138;

export interface WinnerStampProps {
  /** "THE BALI SIX PICKED", or the locked-in line. */
  readonly top: string;
  readonly word: string;
  /** "WINS 4–2" or "LOCKED IN". */
  readonly bottom: string;
  readonly guide: { readonly kind: string; readonly name: string };
  /** Plays the drop; false draws the finished stamp. */
  readonly play: boolean;
  /** Called once the stamp has landed (or at once when it doesn't play). */
  readonly onLanded?: () => void;
}

export function WinnerStamp({ top, word, bottom, guide, play, onLanded }: WinnerStampProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const ink = t.stamp.orange;
  const stamp = t.motion.stamp;
  const disc = useSharedValue(play ? 0 : 1);
  const fall = useSharedValue(play && !reduced ? 0 : 1);
  const shown = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    if (!play) {
      onLanded?.();
      return;
    }
    const landed = () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onLanded?.();
    };
    if (reduced) {
      disc.set(withTiming(1, REDUCED_FADE));
      shown.set(
        withTiming(1, REDUCED_FADE, (finished) => {
          if (finished === true) scheduleOnRN(landed);
        }),
      );
      return;
    }
    disc.set(withSpring(1, SPRINGS.smooth));
    shown.set(withTiming(1, REDUCED_FADE));
    fall.set(
      withDelay(
        REDUCED_FADE.duration ?? 0,
        withSpring(1, SPRINGS.lively, (finished) => {
          if (finished !== true) return;
          scheduleOnRN(landed);
        }),
      ),
    );
    // Runs once per mount: a stamp lands once.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, []);

  const discStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.6 + 0.4 * disc.value }],
  }));
  const ringStyle = useAnimatedStyle(() => {
    const p = fall.value;
    // High, big and turned → the rest tilt. Lively overshoots past 1 once: that beat is the impact,
    // drawn as the stamp pressing flat (wider than tall), then it settles.
    const scale = 1 + (stamp.fromScale - 1) * (1 - p);
    const press = Math.max(0, p - 1) * 4;
    return {
      opacity: p <= 0 ? 0 : 1,
      transform: [
        { translateY: stamp.fromY * (1 - Math.min(1, p)) },
        { rotate: `${stamp.fromRotate * (1 - p) + RING_TILT * p}deg` },
        { scaleX: scale * (1 - (1 - stamp.impactScaleX) * Math.min(1, press)) },
        { scaleY: scale * (1 - (1 - stamp.impactScaleY) * Math.min(1, press)) },
      ],
    };
  });

  return (
    <View
      style={{ alignItems: 'center', justifyContent: 'center', height: DISC + t.space.gap16 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${top} ${word} ${bottom}`}
      testID="reveal-stamp"
    >
      <Animated.View
        style={[
          {
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            backgroundColor: t.accent.stickerEdge,
            boxShadow: t.shadow.card,
            alignItems: 'center',
            justifyContent: 'center',
          },
          discStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: RING,
              height: RING,
              borderRadius: RING / 2,
              borderWidth: OUTER_BAND,
              borderColor: ink.ring,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: t.space.gap16,
            },
            ringStyle,
          ]}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: RING - INNER_AT * 2,
              height: RING - INNER_AT * 2,
              borderRadius: RING / 2 - INNER_AT,
              borderWidth: INNER_BAND,
              borderColor: ink.ring,
            }}
          />
          <Text variant="tier" color={ink.text} align="center" numberOfLines={2}>
            {top}
          </Text>
          <Text
            variant="hero"
            color={ink.text}
            align="center"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
            style={{ alignSelf: 'stretch' }}
            testID="reveal-name"
          >
            {word}
          </Text>
          <Text variant="placeTag" color={ink.text} align="center" testID="reveal-score">
            {bottom}
          </Text>
        </Animated.View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', end: -t.space.gap10, bottom: -t.space.gap16 }, discStyle]}
      >
        <CritterSticker kind={guide.kind} name={guide.name} size={GUIDE} pose="hop" />
      </Animated.View>
    </View>
  );
}
