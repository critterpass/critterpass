import { useEffect, useImperativeHandle, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { premium } from '@cp/design-tokens';

import { usePremiumReducedMotion } from './reduced-motion';
import { REDUCED_FADE, SPRINGS } from './springs';
import { swipeVerdict } from './swipe-verdict';
import type { SwipeVote } from './swipe-verdict';

const W = premium.motion.swipe;

export interface SwipeDeckHandle {
  /** Votes on the top card as the ✕ / ✓ buttons do: nudge, stamp (for `in`), fly off. */
  readonly vote: (vote: SwipeVote) => void;
}

export interface SwipeDeckProps<T> {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly renderCard: (item: T) => ReactNode;
  /** The stamp that lands on a card voted in ("I'M IN"), drawn unrotated. */
  readonly inStamp: ReactNode;
  /** Fired as the vote commits (before the card has flown), so the write and the haptic are instant. */
  readonly onVote: (item: T, vote: SwipeVote) => void;
  readonly ref?: Ref<SwipeDeckHandle>;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

interface TopCardProps {
  readonly children: ReactNode;
  readonly inStamp: ReactNode;
  readonly rise: boolean;
  readonly onCommitted: (vote: SwipeVote) => void;
  readonly onGone: () => void;
  readonly handleRef: Ref<SwipeDeckHandle> | undefined;
  readonly testID: string | undefined;
}

function TopCard({
  children,
  inStamp,
  rise,
  onCommitted,
  onGone,
  handleRef,
  testID,
}: TopCardProps) {
  const reduced = usePremiumReducedMotion();
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const stamp = useSharedValue(0);
  const fade = useSharedValue(1);
  const settle = useSharedValue(rise ? 0 : 1);
  const busy = useSharedValue(false);

  useEffect(() => {
    if (!rise) return;
    settle.set(reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.lively));
  }, [rise, reduced, settle]);

  const done = () => onGone();
  const commit = (vote: SwipeVote) => onCommitted(vote);

  const flyOff = (vote: SwipeVote) => {
    'worklet';
    const dir = vote === 'in' ? 1 : -1;
    if (reduced) {
      fade.set(
        withTiming(0, REDUCED_FADE, (finished) => {
          if (finished) scheduleOnRN(done);
        }),
      );
      return;
    }
    if (vote === 'in') stamp.set(withSpring(1, SPRINGS.lively));
    y.set(withSpring(W.flyY, SPRINGS.smooth));
    x.set(
      withSpring(dir * W.flyX, SPRINGS.smooth, (finished) => {
        if (finished) scheduleOnRN(done);
      }),
    );
  };

  const release = (vote: SwipeVote | null) => {
    'worklet';
    if (vote === null) {
      x.set(withSpring(0, SPRINGS.snappy));
      return;
    }
    busy.set(true);
    scheduleOnRN(commit, vote);
    flyOff(vote);
  };

  useImperativeHandle(handleRef, () => ({
    vote: (vote: SwipeVote) => {
      if (busy.get()) return;
      busy.set(true);
      commit(vote);
      if (reduced) {
        flyOff(vote);
        return;
      }
      // The button vote nudges the card first, so it reads as the same card being swiped.
      const dir = vote === 'in' ? 1 : -1;
      x.set(
        withSpring(dir * W.nudgeX, SPRINGS.snappy, (finished) => {
          if (finished) flyOff(vote);
        }),
      );
    },
  }));

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      'worklet';
      if (busy.get()) return;
      x.set(event.translationX);
    })
    .onEnd((event) => {
      'worklet';
      if (busy.get()) return;
      release(swipeVerdict(event.translationX, event.velocityX, width.get()));
    });

  const cardStyle = useAnimatedStyle(() => {
    const tilt = interpolate(
      x.value,
      [-W.flyX, -W.nudgeX, 0, W.nudgeX, W.flyX],
      [-W.flyRotate, -W.nudgeRotate, 0, W.nudgeRotate, W.flyRotate],
    );
    return {
      opacity: fade.value,
      transform: [
        { translateX: x.value },
        { translateY: y.value + interpolate(settle.value, [0, 1], [W.nextFromY, 0]) },
        { rotate: `${String(tilt)}deg` },
        { scale: interpolate(settle.value, [0, 1], [W.nextFromScale, 1]) },
      ],
    };
  });

  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.value <= 0 ? 0 : 1,
    transform: [
      { scale: interpolate(stamp.value, [0, 1], [W.stampFromScale, 1]) },
      { rotate: `${String(W.stampRotate)}deg` },
    ],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    width.set(e.nativeEvent.layout.width);
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.card, styles.pivot, cardStyle]}
        onLayout={onLayout}
        testID={testID}
      >
        {children}
        <View style={styles.stampSlot} pointerEvents="none">
          <Animated.View style={stampStyle}>{inStamp}</Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * The swipe vote (Foundations 1.09): a deck where the top card follows the finger and tilts about a
 * point below it; a fling past a third of the card (or a fast flick) commits. Voted in, the stamp
 * lands on the card (Lively) as it flies off (Smooth); the next card rises from just behind
 * (Lively). A short drag springs back on Snappy. Reduce Motion cross-fades cards instead.
 */
export function SwipeDeck<T>({
  items,
  keyOf,
  renderCard,
  inStamp,
  onVote,
  ref,
  style,
  testID,
}: SwipeDeckProps<T>) {
  const [index, setIndex] = useState(0);
  const [risen, setRisen] = useState(false);
  const top = items[index];
  const next = items[index + 1];

  return (
    <View style={[styles.deck, style]} testID={testID}>
      {next === undefined ? null : (
        <View style={[styles.card, styles.behind]} pointerEvents="none" key={keyOf(next)}>
          {renderCard(next)}
        </View>
      )}
      {top === undefined ? null : (
        <TopCard
          key={keyOf(top)}
          inStamp={inStamp}
          rise={risen}
          handleRef={ref}
          onCommitted={(vote) => onVote(top, vote)}
          onGone={() => {
            setRisen(true);
            setIndex((i) => i + 1);
          }}
          testID={testID ? `${testID}-top` : undefined}
        >
          {renderCard(top)}
        </TopCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1 },
  card: { ...StyleSheet.absoluteFill },
  pivot: { transformOrigin: '50% 120%' },
  behind: { transform: [{ translateY: W.nextFromY }, { scale: W.nextFromScale }] },
  stampSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
