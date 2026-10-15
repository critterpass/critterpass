/**
 * Whether the playing story card has played `at` milliseconds on its own clock, so a card's parts
 * land in step with the bar and stop with it when the story pauses.
 */
import { useEffect, useState } from 'react';

import { useStoryClock } from '@/lib/story/story-clock';

export function useClockReached(at: number): boolean {
  const clock = useStoryClock();
  const [reached, setReached] = useState(() => clock.playedMs() >= at);
  useEffect(() => {
    if (reached || clock.paused) return undefined;
    const timer = setTimeout(() => setReached(true), Math.max(0, at - clock.playedMs()));
    return () => clearTimeout(timer);
  }, [at, clock, reached]);
  return reached;
}
