/**
 * The calm moment on the trip's own screen: the app in front on the trips tab root or a trip's
 * hub, resting there while nothing is presented over it and nobody is typing. Any route change
 * or a trip to the background starts the wait again; while the screen is busy the wait repeats.
 */
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';

import { isTripSurfacePath, VISIT_CONSENT_CALM_MS } from './consent-prompt';

export interface RestedOptions {
  /** The app is in front. */
  readonly active: boolean;
  /** A sheet or rise is up, a text field has focus or the keyboard is showing, right now. */
  readonly busy: () => boolean;
  readonly restMs?: number;
}

export function useRestedOnTripSurface({
  active,
  busy,
  restMs = VISIT_CONSENT_CALM_MS,
}: RestedOptions): boolean {
  const pathname = usePathname();
  const onSurface = active && isTripSurfacePath(pathname);
  const [rested, setRested] = useState<string | null>(null);

  useEffect(() => {
    if (!onSurface) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const wait = () => {
      timer = setTimeout(() => {
        if (busy()) wait();
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
  return onSurface && rested === pathname;
}
