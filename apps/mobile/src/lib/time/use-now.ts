/**
 * The clock for anything a screen shows: the time now, read again every `intervalMs` on the
 * interval's own boundary (a minute clock turns over as the minute does). It ticks only while the
 * screen it is on is focused and the app is in front, and reads a fresh time the moment either
 * comes back. Outside a navigator only the app's state counts.
 */
import { useEffect, useRef, useState } from 'react';

import { useAppActive, useScreenFocused } from './use-screen-active';

export interface UseNowOptions {
  /** `false` rests the clock on its last value, for a caller with nothing to count. @default true */
  readonly enabled?: boolean;
  /**
   * `true` for a session-wide caller that is not part of any screen: it follows only the app's
   * state, whichever screen is in front. @default false
   */
  readonly anyScreen?: boolean;
}

export function useNow(intervalMs: number, options: UseNowOptions = {}): Date {
  const focused = useScreenFocused();
  const appActive = useAppActive();
  const running = (focused || options.anyScreen === true) && appActive && (options.enabled ?? true);
  const [now, setNow] = useState(() => new Date());
  const mounted = useRef(false);

  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (!running) return undefined;
    // Back in view (or switched on): the value held while resting is stale.
    if (!first) setNow(new Date());
    let timer: ReturnType<typeof setTimeout>;
    const wait = () => {
      timer = setTimeout(
        () => {
          setNow(new Date());
          wait();
        },
        intervalMs - (Date.now() % intervalMs),
      );
    };
    wait();
    return () => clearTimeout(timer);
  }, [running, intervalMs]);

  return now;
}
