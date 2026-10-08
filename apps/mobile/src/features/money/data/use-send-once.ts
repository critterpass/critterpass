/**
 * A send that goes out once: `take()` is true for the first tap and false for every tap after it,
 * until `release()` gives it back (the send was refused or never left). Held in a ref, so a second
 * tap in the same frame is caught before any state has changed.
 */
import { useMemo, useRef } from 'react';

export interface SendOnce {
  readonly take: () => boolean;
  readonly release: () => void;
}

export function useSendOnce(): SendOnce {
  const taken = useRef(false);
  return useMemo(
    () => ({
      take: () => {
        if (taken.current) return false;
        taken.current = true;
        return true;
      },
      release: () => {
        taken.current = false;
      },
    }),
    [],
  );
}
