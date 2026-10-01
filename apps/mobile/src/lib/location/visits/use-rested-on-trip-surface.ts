/**
 * The calm moment on a trip screen: the app in front on the trips tab, a trip's hub or its
 * day-of screen, resting there with nothing presented over it. Any route change or a trip to the
 * background starts the wait again; while something covers the screen the wait simply repeats.
 */
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';

import { isTripSurfacePath, VISIT_CONSENT_CALM_MS } from './consent-prompt';

export interface RestedOptions {
  /** The app is in front. */
  readonly active: boolean;
  /** A sheet or rise is up over the screen right now. */
  readonly covered: () => boolean;
  readonly restMs?: number;
}

export function useRestedOnTripSurface({
  active,
  covered,
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
        if (covered()) wait();
        else setRested(pathname);
      }, restMs);
    };
    wait();
    return () => {
      clearTimeout(timer);
      setRested(null);
    };
    // `covered` is read when the wait ends; its identity does not restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSurface, pathname, restMs]);

  // The render right after a route change still holds the previous path's answer.
  return onSurface && rested === pathname;
}
