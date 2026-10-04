/**
 * GO's data for one opening: the place from synced rows, where the phone is (asked now, because
 * the person tapped GO), the walk and drive route from our api, and Grab's fare on a trip. The
 * position is passed to the api in a POST body and kept in this screen's state only.
 */
import { distanceM } from '@cp/domain';
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useSyncStatus } from '@/data/status/use-sync-status';

import { deviceGoApi, type GoApi } from './data/api';
import { locateForGo } from './data/locate';
import { loadGoPlace, type GoPlace, type GoTarget } from './data/go-place';
import type { GoMode } from './maps-handoff';
import {
  firstMode,
  previewState,
  type LocateState,
  type PreviewState,
  type RideState,
  type RouteState,
} from './preview-model';

export interface GoPreviewData {
  /** Undefined while the place loads; null when the target names nothing GO can open. */
  readonly place: GoPlace | null | undefined;
  readonly state: PreviewState;
  readonly mode: GoMode;
  readonly setMode: (mode: GoMode) => void;
}

export function useGoPreview(target: GoTarget | null, api: GoApi = deviceGoApi): GoPreviewData {
  const { db } = useLocalFirst();
  const online = useSyncStatus().phase !== 'offline';
  const [loaded, setLoaded] = useState<{ key: string; place: GoPlace | null } | null>(null);
  const [locate, setLocate] = useState<LocateState>({ kind: 'locating' });
  const [answers, setAnswers] = useState<{
    key: string;
    route: RouteState;
    ride: RideState;
  } | null>(null);
  const [picked, setPicked] = useState<GoMode | null>(null);

  const targetKey = target === null ? null : JSON.stringify(target);
  useEffect(() => {
    if (target === null || targetKey === null) return undefined;
    let live = true;
    void loadGoPlace(db, target, new Date())
      .catch(() => null)
      .then((next) => {
        if (live) setLoaded({ key: targetKey, place: next });
      });
    return () => {
      live = false;
    };
    // `target` is folded into `targetKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, targetKey]);
  const place = target === null ? null : loaded?.key === targetKey ? loaded.place : undefined;

  useEffect(() => {
    let live = true;
    void locateForGo().then((next) => {
      if (live) setLocate(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const here = locate.kind === 'here' ? locate.at : null;
  // One ask per place and position; a new key reads as loading until its answers land.
  const askKey =
    here === null || !place || !online ? null : `${place.poiId}|${here.lat},${here.lng}`;
  useEffect(() => {
    if (askKey === null || here === null || !place) return undefined;
    let live = true;
    const merge = (next: Partial<{ route: RouteState; ride: RideState }>) =>
      setAnswers((was) => ({
        key: askKey,
        route: was?.key === askKey ? was.route : { kind: 'loading' },
        ride: was?.key === askKey ? was.ride : { kind: place.tripId === null ? 'none' : 'loading' },
        ...next,
      }));
    void api.routePreview({ from: here, to: place, tripId: place.tripId }).then((outcome) => {
      if (!live) return;
      merge({
        route:
          outcome.kind === 'ok'
            ? { kind: 'ready', preview: outcome.value }
            : { kind: outcome.kind === 'offline' ? 'offline' : 'error' },
      });
    });
    if (place.tripId !== null) {
      void api
        .rideQuote({ tripId: place.tripId, toPoi: place.poiId, from: here })
        .then((outcome) => {
          if (!live) return;
          merge({
            ride:
              outcome.kind === 'ok' ? { kind: 'ready', quote: outcome.value } : { kind: 'none' },
          });
        });
    }
    return () => {
      live = false;
    };
    // `here` and `place` are folded into `askKey`; `api` is fixed per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey]);
  const current = askKey !== null && answers?.key === askKey ? answers : null;
  const route: RouteState =
    askKey === null ? { kind: 'idle' } : (current?.route ?? { kind: 'loading' });
  const ride: RideState = current?.ride ?? { kind: 'none' };

  const preview = route.kind === 'ready' ? route.preview : null;
  const straight = here !== null && place ? distanceM(here, place) : null;
  const mode = picked ?? firstMode(preview, straight);
  const state = previewState({
    place: place ?? { lat: 0, lng: 0 },
    locate,
    route,
    online,
    mode,
    ride,
  });
  return { place, state, mode, setMode: setPicked };
}
