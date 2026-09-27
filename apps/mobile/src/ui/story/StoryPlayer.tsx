import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useStoryProgress } from '@/motion/patterns/story-progress';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface StorySegment {
  readonly id: string;
  /** Full-bleed slide content (photo, headline, stickers). */
  readonly content: ReactNode;
  /** Narration caption shown over the slide and read by screen readers. */
  readonly caption?: string;
  /** Spoken summary of the slide. */
  readonly label: string;
}

export interface StoryPlayerProps {
  readonly segments: readonly StorySegment[];
  /** Header row under the progress bars (guide sticker, "Pon presents", ✕). */
  readonly header?: ReactNode;
  /** Bottom actions (I'm in / Maybe). */
  readonly footer?: ReactNode;
  /** Side overlay (reaction floats). */
  readonly overlay?: ReactNode;
  /** "Tap for Day 3 · hold to pause". */
  readonly hint?: string;
  readonly onIndexChange?: (index: number) => void;
  /** After the last segment finishes. */
  readonly onFinished?: () => void;
  readonly initialIndex?: number;
  readonly testID?: string;
}

const PUSH_IN_SCALE = 1.08;
const HOLD_MS = 200;

const useStyles = makeStyles((th) => ({
  root: { flex: 1, overflow: 'hidden', backgroundColor: th.color.ink['930'] },
  bars: {
    flexDirection: 'row',
    gap: th.space['4'],
    paddingHorizontal: th.space['12'],
    paddingTop: th.space['8'],
  },
  track: {
    flex: 1,
    height: th.space['2'] + 1,
    borderRadius: th.radius.xs,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: th.semantic.text.primary, transformOrigin: 'left' },
  chrome: { position: 'absolute', top: 0, start: 0, end: 0 },
  bottom: { position: 'absolute', bottom: 0, start: 0, end: 0, padding: th.space['16'] },
  side: { position: 'absolute', end: th.space['16'], bottom: '35%' },
}));

function ProgressBar({
  state,
  paused,
  onComplete,
  announcement,
}: {
  readonly state: 'past' | 'active' | 'future';
  readonly paused: boolean;
  readonly onComplete: () => void;
  readonly announcement: string;
}) {
  const styles = useStyles();
  const { progress } = useStoryProgress({
    active: state === 'active',
    paused,
    onComplete,
    completionAnnouncement: announcement,
  });
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: state === 'past' ? 1 : state === 'future' ? 0 : progress.value }],
  }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, style]} />
    </View>
  );
}

/**
 * Story playback (proposal trailer, recap): 5-second segments, tap start/end thirds to step, hold
 * to pause, a visible pause button, captions, and a slow push-in that Reduce Motion drops.
 */
export function StoryPlayer({
  segments,
  header,
  footer,
  overlay,
  hint,
  onIndexChange,
  onFinished,
  initialIndex = 0,
  testID,
}: StoryPlayerProps) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [width, setWidth] = useState(0);
  const scale = useSharedValue(1);
  const segment = segments[index];
  const total = segments.length;

  const go = (next: number) => {
    if (next >= total) {
      onFinished?.();
      return;
    }
    const clamped = Math.max(0, next);
    setIndex(clamped);
    onIndexChange?.(clamped);
  };

  useEffect(() => {
    scale.value = 1;
    if (reduced) return;
    scale.value = withTiming(PUSH_IN_SCALE, { duration: tokens.motion.duration.story });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scale is a stable shared value ref.
  }, [index, reduced]);
  const pushIn = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

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

  const n = index + 1;
  const position = t({ id: 'common.story.position', message: `Slide ${n} of ${total}` });
  const pauseLabel = paused
    ? t({ id: 'common.story.play', message: 'Play' })
    : t({ id: 'common.story.pause', message: 'Pause' });

  return (
    <View
      testID={testID}
      style={styles.root}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <GestureDetector gesture={Gesture.Exclusive(hold, tap)}>
        <Animated.View
          style={[{ flex: 1 }, pushIn]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={segment ? `${position}. ${segment.label}` : position}
          accessibilityActions={[
            { name: 'increment', label: t({ id: 'common.story.next', message: 'Next slide' }) },
            {
              name: 'decrement',
              label: t({ id: 'common.story.previous', message: 'Previous slide' }),
            },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') go(index + 1);
            if (event.nativeEvent.actionName === 'decrement') go(index - 1);
          }}
        >
          {segment?.content}
        </Animated.View>
      </GestureDetector>
      <Stack style={styles.chrome} gap="10">
        <View style={styles.bars} importantForAccessibility="no-hide-descendants">
          {segments.map((item, i) => (
            <ProgressBar
              key={item.id}
              state={i < index ? 'past' : i === index ? 'active' : 'future'}
              paused={paused}
              onComplete={() => go(i + 1)}
              announcement={segments[i + 1]?.label ?? ''}
            />
          ))}
        </View>
        {header}
      </Stack>
      {overlay ? <View style={styles.side}>{overlay}</View> : null}
      <Stack style={styles.bottom} gap="12">
        {segment?.caption ? (
          <Text variant="bodyLg" accessibilityLiveRegion="polite">
            {segment.caption}
          </Text>
        ) : null}
        <Row justify="space-between" align="center" gap="8">
          {hint ? <Text variant="caption">{hint}</Text> : <View />}
          <ActionPill
            label={pauseLabel}
            selected={paused}
            onPress={() => setPaused((value) => !value)}
          />
        </Row>
        {footer}
      </Stack>
    </View>
  );
}
