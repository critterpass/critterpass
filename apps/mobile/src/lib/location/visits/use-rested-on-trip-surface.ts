/**
 * The calm moment on the trip's own screen: the app in front on the trips tab root or a trip's
 * hub, resting there while nothing is presented over it and nobody is typing. Any route change
 * or a trip to the background starts the wait again; while the screen is busy the wait repeats.
 * A ceremony that is waiting for its own calm moment, or is up (the arrival hatch), goes first:
 * while one is pending the screen never counts as rested.
 */
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { isTripSurfacePath, VISIT_CONSENT_CALM_MS } from './consent-prompt';

let ceremonyPending = false;

/** The arrival hatch has yet to play here (waiting to open, or open): nothing else may rise. */
export function setCeremonyPending(pending: boolean): void {
  ceremonyPending = pending;
}

export function isCeremonyPending(): boolean {
  return ceremonyPending;
}

export interface RestedOptions {
  /** A sheet or rise is up, a text field has focus or the keyboard is showing, right now. */
  readonly busy: () => boolean;
  readonly restMs?: number;
}

/** A state not reported yet (right after launch) counts as in front. */
const inFront = (state: string | null | undefined) =>
  state !== 'background' && state !== 'inactive';

function useInFront(): boolean {
  const [front, setFront] = useState(inFront(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setFront(inFront(state)));
    return () => subscription.remove();
  }, []);
  return front;
}

export function useRestedOnTripSurface({
  busy,
  restMs = VISIT_CONSENT_CALM_MS,
}: RestedOptions): boolean {
  const pathname = usePathname();
  const onSurface = useInFront() && isTripSurfacePath(pathname);
  const [rested, setRested] = useState<string | null>(null);

  useEffect(() => {
    if (!onSurface) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const wait = () => {
      timer = setTimeout(() => {
        if (busy() || ceremonyPending) wait();
        else setRested(pathname);
      }, restMs);
    };
    wait();
    return () => {
      clearTimeout(timer);
      setRested(null);
    };
    // `busy` is read when the wait ends; its identity does not restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSurface, pathname, restMs]);

  // The render right after a route change still holds the previous path's answer.
  return onSurface && rested === pathname && !ceremonyPending;
}
