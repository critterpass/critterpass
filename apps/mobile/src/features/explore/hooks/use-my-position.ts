/**
 * Where the phone was last seen, for the map's you-dot: read only when location is already
 * allowed while the app is in use (the map never asks by itself), and not at all otherwise.
 */
import { getForegroundPermissionsAsync, getLastKnownPositionAsync } from 'expo-location';
import { useEffect, useState } from 'react';

import type { Point } from '../map-model';

const MAX_AGE_MS = 10 * 60_000;

export type PositionState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'at'; readonly point: Point };

export function useMyPosition(): PositionState {
  const [state, setState] = useState<PositionState>({ kind: 'checking' });
  useEffect(() => {
    let live = true;
    void (async () => {
      const permission = await getForegroundPermissionsAsync();
      if (!permission.granted) return { kind: 'denied' } as const;
      const position = await getLastKnownPositionAsync({ maxAge: MAX_AGE_MS });
      return position === null
        ? ({ kind: 'unknown' } as const)
        : ({
            kind: 'at',
            point: { lat: position.coords.latitude, lng: position.coords.longitude },
          } as const);
    })()
      .catch(() => ({ kind: 'unknown' }) as const)
      .then((next) => {
        if (live) setState(next);
      });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
