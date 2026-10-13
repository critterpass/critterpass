/**
 * The trailer's story player in the premium look, drawn like the recap story (ink bars on paper): one thin bar per
 * slide along the top, the slide full bleed, tap the right two thirds for the next slide and the
 * left third for the one before, hold to pause, swipe down to close; assistive tech gets next,
 * previous and pause actions.
 */
import { t } from '@lingui/core/macro';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useStoryProgress } from '@/motion/patterns/story-progress';
import { usePremiumTheme } from '@/ui/premium';

const HOLD_MS = 200;
const SWIPE_CLOSE = 90;

export interface TrailerSegment {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

function Bar(props: {
  readonly state: 'past' | 'active' | 'future';
  readonly paused: boolean;
  readonly announcement: string;
  readonly onComplete: () => void;
}) {
  const { progress } = useStoryProgress({
    active: props.state === 'active',
    paused: props.paused,
    onComplete: props.onComplete,
    completionAnnouncement: props.announcement,
  });
  const { color } = usePremiumTheme();
  const state = props.state;
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: state === 'past' ? 1 : state === 'future' ? 0 : progress.value }],
  }));
  return (
    <View style={[styles.track, { backgroundColor: color.progressTodo }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color.ink }, fill]} />
    </View>
  );
}

export function TrailerPlayer(props: {
  readonly segments: readonly TrailerSegment[];
  /** Where the bars sit (under the status bar). */
  readonly top: number;
  readonly held: boolean;
  readonly chrome: ReactNode;
  readonly bottom: ReactNode;
  readonly onFinished: () => void;
  readonly onClose: () => void;
  readonly testID?: string;
}) {
  const { segments, onFinished, onClose } = props;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [width, setWidth] = useState(0);
  const total = segments.length;
  const segment = segments[index];
  const go = (next: number) => {
    if (next >= total) onFinished();
    else setIndex(Math.max(0, next));
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
      testID={props.testID}
      style={styles.root}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <GestureDetector gesture={Gesture.Race(swipe, Gesture.Exclusive(hold, tap))}>
        <View
          style={styles.root}
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
          {segment?.content}
        </View>
      </GestureDetector>
      <View
        style={[styles.bars, { top: props.top }]}
        importantForAccessibility="no-hide-descendants"
      >
        {segments.map((item, i) => (
          <Bar
            key={item.id}
            state={i < index ? 'past' : i === index ? 'active' : 'future'}
            paused={paused || props.held}
            announcement={segments[i + 1]?.label ?? ''}
            onComplete={() => go(i + 1)}
          />
        ))}
      </View>
      <View style={[styles.chrome, { top: props.top + 12 }]}>{props.chrome}</View>
      <View style={styles.bottom}>{props.bottom}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bars: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 4 },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, transformOrigin: 'left' },
  chrome: { position: 'absolute', left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
