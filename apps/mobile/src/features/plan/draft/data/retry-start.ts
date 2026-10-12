/**
 * Asking again for a draft start that got no answer. No signal and a server too busy to take the
 * start (a 5xx, a retryable error) look the same to the screen, but only the first ends with a
 * "back online" event: so the start goes again the moment the phone is back online, and on a slow
 * beat while it is online, until it has an answer.
 */
import { useEffect, useRef } from 'react';

import type { NetworkSource } from '@/data/status/network';

/** How often a start the server could not take is asked again while the phone is online. */
export const START_RETRY_MS = 20_000;

export function useRetryStart(
  waiting: boolean,
  network: NetworkSource,
  retry: () => Promise<void>,
  everyMs = START_RETRY_MS,
): void {
  const latest = useRef(retry);
  useEffect(() => {
    latest.current = retry;
  }, [retry]);

  useEffect(() => {
    if (!waiting) return undefined;
    let busy = false;
    const again = () => {
      if (busy) return;
      busy = true;
      void latest.current().finally(() => {
        busy = false;
      });
    };
    const timer = setInterval(() => {
      if (network.isOnline()) again();
    }, everyMs);
    const unsubscribe = network.subscribe((online) => {
      if (online) again();
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [waiting, network, everyMs]);
}
