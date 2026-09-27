import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useMotionMode } from '@/motion/motion-mode';

/** docs/design-system.md §3.1 `blink`: eyes shut for 150 ms every 2.6–6.2 s. */
export const BLINK_CLOSED_MS = 150;
export const BLINK_MIN_GAP_MS = 2600;
export const BLINK_MAX_GAP_MS = 6200;

export interface UseBlinkOptions {
  /** Off-screen stickers (list virtualisation, hidden tabs) pass `false`. @default true */
  readonly visible?: boolean;
  /** Only creatures with a closed-eyes frame blink. @default true */
  readonly enabled?: boolean;
  /** Seam for deterministic gaps in tests. @default Math.random */
  readonly random?: () => number;
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * Whether a creature sticker should show its closed-eyes frame right now. Blinks swap between the
 * sticker's two cached frames, so they run on JS timers, paused exactly when the shared idle loops
 * rest: screen unfocused, sticker off-screen, app in the background, or motion not `full`
 * (Reduce Motion or the in-app setting).
 */
export function useBlink({
  visible = true,
  enabled = true,
  random = Math.random,
}: UseBlinkOptions = {}): boolean {
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [motionMode] = useMotionMode();
  const running = enabled && visible && focused && appActive && motionMode === 'full';
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!running) return;
    let gapTimer: ReturnType<typeof setTimeout> | undefined;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const gap = BLINK_MIN_GAP_MS + random() * (BLINK_MAX_GAP_MS - BLINK_MIN_GAP_MS);
      gapTimer = setTimeout(() => {
        setClosed(true);
        openTimer = setTimeout(() => {
          setClosed(false);
          schedule();
        }, BLINK_CLOSED_MS);
      }, gap);
    };
    schedule();
    return () => {
      clearTimeout(gapTimer);
      clearTimeout(openTimer);
      setClosed(false);
    };
  }, [running, random]);

  return running && closed;
}
