/**
 * The story waits for the guide: when a card is about to end and its voice line is still
 * speaking, the card holds just short of its end until the line finishes, then plays out and the
 * next card comes. A line that never ends (a stalled clip) is given up on after a maximum, and a
 * tap still moves on at once.
 */
import { useEffect, useState } from 'react';

import { useStoryClock } from '@/ui/story/story-clock';

/** How short of its end a card holds for its voice, and so the breath after the line. */
export const VOICE_WAIT_LEAD_MS = 250;
/** The longest a card is held past its own length. */
export const VOICE_WAIT_MAX_MS = 20_000;

/** True while the card should be held for its voice line. */
export function useVoiceWait(speaking: boolean, durationMs: number): boolean {
  const clock = useStoryClock();
  const [nearEnd, setNearEnd] = useState(false);
  const [givenUp, setGivenUp] = useState(false);

  useEffect(() => {
    if (nearEnd || clock.paused) return undefined;
    const left = durationMs - VOICE_WAIT_LEAD_MS - clock.playedMs();
    const timer = setTimeout(() => setNearEnd(true), Math.max(0, left));
    return () => clearTimeout(timer);
    // The clock's functions are stable for a card; a pause re-arms the timer from the played time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.paused, nearEnd, durationMs]);

  const holding = nearEnd && speaking && !givenUp;
  useEffect(() => {
    if (!holding) return undefined;
    const timer = setTimeout(() => setGivenUp(true), VOICE_WAIT_MAX_MS);
    return () => clearTimeout(timer);
  }, [holding]);

  return holding;
}
