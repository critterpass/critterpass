/**
 * True once the screen has finished being presented (its native transition ended), so a system
 * alert raised then never lands mid-presentation. A screen that mounts after its transition, or
 * whose navigator sends no transition events, counts as presented after a short wait.
 */
import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

/** Longer than any presentation (the native rise and fade run about 350 ms). */
export const PRESENTED_FALLBACK_MS = 600;

interface TransitionEvents {
  readonly addListener?: (event: 'transitionEnd', listener: () => void) => () => void;
}

export function usePresented(): boolean {
  const navigation: TransitionEvents | undefined = useNavigation();
  const [presented, setPresented] = useState(false);
  useEffect(() => {
    if (presented) return undefined;
    const done = () => setPresented(true);
    const timer = setTimeout(done, PRESENTED_FALLBACK_MS);
    const unsubscribe = navigation?.addListener?.('transitionEnd', done);
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [navigation, presented]);
  return presented;
}
