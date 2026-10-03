/**
 * One story segment's progress bar: full for past slides, empty for later ones, and the playing
 * slide's bar filling on its own clock (handed to the player for the slide's content). Light over
 * dark and photo slides, ink over paper.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useStoryProgress, type StoryProgress } from '@/motion/patterns/story-progress';

import { makeStyles } from '../theme';

const useStyles = makeStyles((th) => ({
  track: {
    flex: 1,
    height: th.space['2'] + 1,
    borderRadius: th.radius.xs,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: th.semantic.text.primary, transformOrigin: 'left' },
  trackInk: { backgroundColor: th.color.paper.muted },
  fillInk: { backgroundColor: th.color.paper.ink },
}));

export function ProgressBar({
  state,
  paused,
  onComplete,
  announcement,
  durationMs,
  tone,
  onClock,
}: {
  readonly state: 'past' | 'active' | 'future';
  readonly paused: boolean;
  readonly onComplete: () => void;
  readonly announcement: string;
  readonly durationMs: number | undefined;
  readonly tone: 'light' | 'ink';
  /** The active bar hands its clock to the player, for the slide content. */
  readonly onClock: (clock: StoryProgress) => void;
}) {
  const styles = useStyles();
  const clock = useStoryProgress({
    active: state === 'active',
    paused,
    onComplete,
    completionAnnouncement: announcement,
    ...(durationMs === undefined ? {} : { durationMs }),
  });
  const { progress } = clock;
  useEffect(() => {
    if (state === 'active') onClock(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock's parts are stable refs.
  }, [state]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: state === 'past' ? 1 : state === 'future' ? 0 : progress.value }],
  }));
  return (
    <View style={[styles.track, tone === 'ink' ? styles.trackInk : null]}>
      <Animated.View style={[styles.fill, tone === 'ink' ? styles.fillInk : null, style]} />
    </View>
  );
}
