/**
 * The SOS's 5-second cancel window: after the slide, a tick every second (haptic), CANCEL stops
 * it and nothing is sent; at zero it fires once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { impact } from '@/motion/impact';

export const SOS_CANCEL_SECONDS = 5;

export function useCountdown(
  onDone: () => void,
  seconds: number = SOS_CANCEL_SECONDS,
  tick: () => void = () => impact('tick'),
) {
  const [left, setLeft] = useState<number | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    let remaining = seconds;
    setLeft(remaining);
    tick();
    timer.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stop();
        setLeft(null);
        done.current();
        return;
      }
      tick();
      setLeft(remaining);
    }, 1000);
  }, [seconds, stop, tick]);

  const cancel = useCallback(() => {
    stop();
    setLeft(null);
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { left, start, cancel };
}
