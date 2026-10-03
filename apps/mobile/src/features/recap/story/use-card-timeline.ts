/**
 * A card's choreography on the story's clock: `steps` are the moments (ms into the card) things
 * happen (a stop pops, a receipt line prints, a signature writes), and the hook returns how many
 * have happened. It reads the bar's own played time, so a hold stops every step where the bar
 * stopped and a resume carries on from the same instant. Reduce Motion shows every step at once;
 * the card's timer still runs.
 */
import { useEffect, useState } from 'react';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useStoryClock } from '@/ui/story/story-clock';

/** How many of `steps` (ascending ms) lie at or before `playedMs`. */
export function stepsReached(steps: readonly number[], playedMs: number): number {
  let reached = 0;
  while (reached < steps.length && (steps[reached] ?? Infinity) <= playedMs) reached += 1;
  return reached;
}

export function useCardTimeline(steps: readonly number[]): number {
  const clock = useStoryClock();
  const reduced = useReducedImpactMotion();
  // Bumped when a step is due: the count itself is read from the clock on every render.
  const [, setTick] = useState(0);
  const key = steps.join(',');

  useEffect(() => {
    if (reduced || clock.paused) return undefined;
    const played = clock.playedMs();
    const timers = steps
      .filter((at) => at > played)
      .map((at) => setTimeout(() => setTick((n) => n + 1), at - played));
    return () => timers.forEach(clearTimeout);
    // `steps` is folded into `key`; the clock's functions are stable for a segment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.paused, clock.index, key, reduced]);

  return reduced ? steps.length : stepsReached(steps, clock.playedMs());
}
