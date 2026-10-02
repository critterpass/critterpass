import { useEffect, useRef } from 'react';
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
}

/**
 * A story's linear 5-second progress bar. Reduced motion still auto-advances on the same timer
 * (design-system.md §5: "story ... auto-advance announced + pause control") — the bar itself just
 * does not animate, and VoiceOver is told the segment changed instead of watching it sweep.
 */
export function useStoryProgress({
  active,
  paused = false,
  onComplete,
  completionAnnouncement,
}: UseStoryProgressOptions): { readonly progress: SharedValue<number> } {
  const progress = useSharedValue(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Time this segment has played, kept on the JS clock: a pause stops the bar where it is, and the
  // resume runs only what was left, never the full story again nor a jump to the next segment.
  const playedRef = useRef(0);

  useEffect(() => {
    if (!active) playedRef.current = 0;
    if (!active || paused) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (paused) cancelAnimation(progress);
      return;
    }

    const startedAt = Date.now();
    const remainingMs = Math.max(0, STORY_MS - playedRef.current);

    timeoutRef.current = setTimeout(() => {
      if (completionAnnouncement)
        AccessibilityInfo.announceForAccessibility(completionAnnouncement);
      onComplete?.();
    }, remainingMs);

    progress.value = withTiming(1, { duration: remainingMs, easing: linearEasing });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      playedRef.current = Math.min(STORY_MS, playedRef.current + Date.now() - startedAt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress is a stable shared value ref; onComplete/completionAnnouncement are read fresh via closure each run.
  }, [active, paused]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state.
    if (!active) progress.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress is a stable shared value ref.
  }, [active]);

  return { progress };
}
