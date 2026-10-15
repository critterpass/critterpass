/**
 * The premium story player (8.10–8.14): one thin bar per card along the top (done in ink, the rest
 * light), the card full bleed, tap the right two thirds for the next card and the left third for
 * the one before, hold to pause, swipe down to close; assistive tech gets next, previous and
 * pause actions. The playing card reads its clock from `useStoryClock`, so its choreography and
 * voice pause with the bar.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useStoryProgress, type StoryProgress } from '@/motion/patterns/story-progress';
import { StoryClockContext, type StoryClock } from '@/lib/story/story-clock';
import { makePremiumStyles } from '@/ui/premium';

import { STORY_TRACK } from '../recap-paint';

const HOLD_MS = 200;
const SWIPE_CLOSE = 90;

export interface PremiumStorySegment {
  readonly id: string;
  readonly label: string;
  readonly durationMs: number;
  readonly content: ReactNode;
  /** Ink bars over a paper card. */
  readonly ink: boolean;
}

const useStyles = makePremiumStyles((th) => ({
  root: { flex: 1, overflow: 'hidden' },
  bars: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 4 },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, transformOrigin: 'left' },
  done: { backgroundColor: th.color.ink },
}));

function Bar({
  state,
  paused,
  durationMs,
  ink,
  announcement,
  onComplete,
  onClock,
}: {
  readonly state: 'past' | 'active' | 'future';
  readonly paused: boolean;
  readonly durationMs: number;
  readonly ink: boolean;
  readonly announcement: string;
  readonly onComplete: () => void;
  readonly onClock: (clock: StoryProgress) => void;
}) {
  const styles = useStyles();
  const clock = useStoryProgress({
    active: state === 'active',
    paused,
    onComplete,
    completionAnnouncement: announcement,
    durationMs,
  });
  const { progress } = clock;
  useEffect(() => {
    if (state === 'active') onClock(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock's parts are stable refs.
  }, [state]);
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: state === 'past' ? 1 : state === 'future' ? 0 : progress.value }],
  }));
  return (
    <View style={[styles.track, { backgroundColor: ink ? STORY_TRACK.ink : STORY_TRACK.light }]}>
      <Animated.View
        style={[styles.fill, ink ? styles.done : { backgroundColor: STORY_TRACK.fillLight }, fill]}
      />
    </View>
  );
}

export function PremiumStoryPlayer({
  segments,
  top,
  chrome,
  bottom,
  held,
  initialIndex = 0,
  onIndexChange,
  onFinished,
  onClose,
  testID,
}: {
  readonly segments: readonly PremiumStorySegment[];
  /** Where the bars sit (under the status bar). */
  readonly top: number;
  /** The presenter row and buttons, under the bars. */
  readonly chrome: ReactNode;
  /** The caption and the card's action, over the foot. */
  readonly bottom: ReactNode;
  readonly held: boolean;
  readonly initialIndex?: number;
  readonly onIndexChange: (index: number) => void;
  readonly onFinished: () => void;
  readonly onClose: () => void;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [width, setWidth] = useState(0);
  const segment = segments[index];
  const total = segments.length;
  const active = useRef<{ index: number; clock: StoryProgress } | null>(null);
  const [progress, setProgress] = useState<SharedValue<number> | null>(null);
  const stopped = paused || held;
  const storyClock = useMemo<StoryClock>(
    () => ({
      index,
      paused: stopped,
      durationMs: segment?.durationMs ?? 0,
      progress,
      playedMs: () => (active.current?.index === index ? active.current.clock.playedMs() : 0),
    }),
    [index, stopped, segment?.durationMs, progress],
  );
  const go = (next: number) => {
    if (next >= total) {
      onFinished();
      return;
    }
    const clamped = Math.max(0, next);
    setIndex(clamped);
    onIndexChange(clamped);
  };
  const tapAt = (x: number) => go(x < width / 3 ? index - 1 : index + 1);
  const tap = Gesture.Tap().onEnd((event) => {
    'worklet';
    scheduleOnRN(tapAt, event.x);
  });
  const hold = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .onStart(() => {
      'worklet';
      scheduleOnRN(setPaused, true);
    })
    .onFinalize(() => {
      'worklet';
      scheduleOnRN(setPaused, false);
    });
  const swipe = Gesture.Pan()
    .activeOffsetY(24)
    .onEnd((event) => {
      'worklet';
      if (event.translationY > SWIPE_CLOSE) scheduleOnRN(onClose);
    });
  const n = index + 1;
  const position = t({ id: 'common.story.position', message: `Slide ${n} of ${total}` });
  return (
    <View
      testID={testID}
      style={styles.root}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <GestureDetector gesture={Gesture.Race(swipe, Gesture.Exclusive(hold, tap))}>
        <View
          style={{ flex: 1 }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={segment === undefined ? position : `${position}. ${segment.label}`}
          accessibilityActions={[
            { name: 'increment', label: t({ id: 'common.story.next', message: 'Next slide' }) },
            {
              name: 'decrement',
              label: t({ id: 'common.story.previous', message: 'Previous slide' }),
            },
            {
              name: 'activate',
              label: paused
                ? t({ id: 'common.story.play', message: 'Play' })
                : t({ id: 'common.story.pause', message: 'Pause' }),
            },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') go(index + 1);
            if (event.nativeEvent.actionName === 'decrement') go(index - 1);
            if (event.nativeEvent.actionName === 'activate') setPaused((value) => !value);
          }}
        >
          <StoryClockContext.Provider value={storyClock}>
            {segment?.content}
          </StoryClockContext.Provider>
        </View>
      </GestureDetector>
      <View style={[styles.bars, { top }]} importantForAccessibility="no-hide-descendants">
        {segments.map((item, i) => (
          <Bar
            key={item.id}
            state={i < index ? 'past' : i === index ? 'active' : 'future'}
            paused={stopped}
            durationMs={item.durationMs}
            ink={segment?.ink ?? false}
            announcement={segments[i + 1]?.label ?? ''}
            onComplete={() => go(i + 1)}
            onClock={(clock) => {
              active.current = { index: i, clock };
              setProgress(clock.progress);
            }}
          />
        ))}
      </View>
      <View style={{ position: 'absolute', top: top + 12, left: 0, right: 0 }}>{chrome}</View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>{bottom}</View>
    </View>
  );
}
