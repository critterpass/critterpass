import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { linearEasing } from '../easing';

// docs/design-system.md §3.4 `storyProgress`: "5000 lin" — the story duration token itself.
const STORY_MS = tokens.motion.duration.story;

export interface UseStoryProgressOptions {
  /** This story segment is the current one; only the active segment's timer/bar runs. */
  readonly active: boolean;
  readonly paused?: boolean;
  readonly onComplete?: () => void;
  /**
   * Screen-reader text announced when this segment finishes (design-system.md §5: "story ...
   * auto-advance announced"). Left to the caller, which owns its own localized copy — a motion
   * primitive should not carry rendered strings.
   */
  readonly completionAnnouncement?: string;
  /** How long this segment plays; the story token (5 s) by default. */
  readonly durationMs?: number;
}

export interface StoryProgress {
  readonly progress: SharedValue<number>;
  /**
   * How long this segment has played, on the same JS clock its timer runs on: the time a card's own
   * choreography reads, so a pause stops every timeline where the bar stopped.
   */
  readonly playedMs: () => number;
}

/**
 * A story's linear progress bar (5 seconds unless the segment says otherwise). Reduced motion still auto-advances on the same timer
 * (design-system.md §5: "story ... auto-advance announced + pause control") — the bar itself just
 * does not animate, and VoiceOver is told the segment changed instead of watching it sweep.
 */
export function useStoryProgress({
  active,
  paused = false,
  onComplete,
  completionAnnouncement,
  durationMs = STORY_MS,
}: UseStoryProgressOptions): StoryProgress {
  const progress = useSharedValue(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Time this segment has played, kept on the JS clock: a pause stops the bar where it is, and the
  // resume runs only what was left, never the full story again nor a jump to the next segment.
  const playedRef = useRef(0);
  // When the running stretch began; null while the bar is not running.
  const runningSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) playedRef.current = 0;
    runningSinceRef.current = null;
    if (!active || paused) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (paused) cancelAnimation(progress);
      return;
    }

    const startedAt = Date.now();
    runningSinceRef.current = startedAt;
    const remainingMs = Math.max(0, durationMs - playedRef.current);

    timeoutRef.current = setTimeout(() => {
      if (completionAnnouncement)
        AccessibilityInfo.announceForAccessibility(completionAnnouncement);
      onComplete?.();
    }, remainingMs);

    progress.value = withTiming(1, { duration: remainingMs, easing: linearEasing });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      runningSinceRef.current = null;
      playedRef.current = Math.min(durationMs, playedRef.current + Date.now() - startedAt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress is a stable shared value ref; onComplete/completionAnnouncement are read fresh via closure each run.
  }, [active, paused]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state.
    if (!active) progress.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress is a stable shared value ref.
  }, [active]);

  const playedMs = useCallback(() => {
    const since = runningSinceRef.current;
    const played = playedRef.current + (since === null ? 0 : Date.now() - since);
    return Math.min(durationMs, played);
  }, [durationMs]);

  return { progress, playedMs };
}
