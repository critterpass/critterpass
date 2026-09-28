/**
 * One side of a this-or-that pair: the top card bobs to invite a tap; a pick (tap or swipe) flings
 * the other card away (≈480 pt, ±50°, 560 ms); a new pair rises in over 460 ms.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useMotionMode } from '@/motion/motion-mode';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import type { QuizQuestionItem } from '../content';
import { CARD_BOB, useOnboardingLoop } from '../motion';

export const FLING_PX = 480;
const FLING_DEG = 50;
export const FLING_MS = 560;
const RISE_MS = 460;
const SWIPE_PICK_PX = 80;

const useStyles = makeStyles((th) => ({
  card: {
    borderRadius: th.radius.xl,
    padding: th.space['16'],
    minHeight: 180,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  lineEnd: { alignSelf: 'flex-end' },
  labelEnd: { textAlign: 'right' },
}));

export type Side = 'left' | 'right';

export function QuizCard({
  question,
  side,
  flung,
  picked,
  onPick,
}: {
  readonly question: QuizQuestionItem;
  readonly side: Side;
  readonly flung: boolean;
  readonly picked: boolean;
  readonly onPick: (side: Side) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [mode] = useMotionMode();
  const full = mode === 'full';
  const bob = useOnboardingLoop(CARD_BOB);
  // The finger's drag and the programmatic fling stay separate values: each has one writer.
  const drag = useSharedValue(0);
  const fling = useSharedValue(0);
  const rise = useSharedValue(full ? 0 : 1);
  const content = question[side];
  const top = side === 'left';

  useEffect(() => {
    rise.value = full ? withTiming(1, { duration: RISE_MS }) : 1;
    // A new question mounts a new pair; each rises once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flung) return;
    const direction = top ? -1 : 1;
    fling.value = full
      ? withTiming(direction * FLING_PX, { duration: FLING_MS })
      : direction * FLING_PX;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flung]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      drag.value = event.translationX;
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > SWIPE_PICK_PX) scheduleOnRN(onPick, side);
      else drag.value = withTiming(0, { duration: tokens.motion.duration.fast });
    });

  const motion = useAnimatedStyle(() => {
    const x = drag.value + fling.value;
    return {
      opacity: rise.value * (1 - Math.min(1, Math.abs(x) / FLING_PX)),
      transform: [
        { translateY: (1 - rise.value) * 40 },
        { translateX: x },
        { rotate: degrees((x / FLING_PX) * FLING_DEG) },
      ],
    };
  });

  const colour = top ? theme.color.yellow : theme.color.blue;
  const tokek = GUIDE_STICKERS.tokek;
  const label = upper(content.label, locale);
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[motion, top && !picked ? bob : null]}>
        <PressScale
          onPress={() => onPick(side)}
          accessibilityLabel={`${content.label}. ${content.line}`}
          accessibilityState={{ selected: picked }}
          widthClass="wide"
          testID={`taste-card-${side}`}
        >
          <View style={[styles.card, { backgroundColor: colour }]}>
            {top ? (
              <>
                <Text variant="displayXl" color={theme.color.ink['950']}>
                  {label}
                </Text>
                <View style={styles.cardRow}>
                  <Text variant="body" color={theme.color.ink['950']}>
                    {content.line}
                  </Text>
                  <Sticker kind={tokek.kind} name={tokek.name} size={84} />
                </View>
              </>
            ) : (
              <>
                <Text variant="body" color={theme.color.ink['950']} style={styles.lineEnd}>
                  {content.line}
                </Text>
                <View style={styles.cardRow}>
                  <Sticker kind={tokek.kind} name={tokek.name} size={84} closedEyes />
                  <Text variant="displayXl" color={theme.color.ink['950']} style={styles.labelEnd}>
                    {label}
                  </Text>
                </View>
              </>
            )}
          </View>
        </PressScale>
      </Animated.View>
    </GestureDetector>
  );
}
