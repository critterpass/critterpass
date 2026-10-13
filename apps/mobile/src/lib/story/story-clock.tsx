/**
 * The playing story segment's clock, for the slide content: which segment is up, whether the story
 * is paused (a hold, the pause action, or the screen holding it), and how long this segment has
 * played on the bar's own clock. A card times its choreography from `playedMs()`, so pausing
 * stops it with the bar and resuming carries on from the same instant.
 */
import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export interface StoryClock {
  readonly index: number;
  readonly paused: boolean;
  readonly durationMs: number;
  /** The segment's bar, 0 → 1; null until the bar has mounted. */
  readonly progress: SharedValue<number> | null;
  readonly playedMs: () => number;
}

const IDLE: StoryClock = {
  index: 0,
  paused: true,
  durationMs: 0,
  progress: null,
  playedMs: () => 0,
};

export const StoryClockContext = createContext<StoryClock>(IDLE);

export function useStoryClock(): StoryClock {
  return useContext(StoryClockContext);
}
