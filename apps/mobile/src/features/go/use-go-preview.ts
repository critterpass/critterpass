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
  const [place, setPlace] = useState<GoPlace | null | undefined>(undefined);
  const [locate, setLocate] = useState<LocateState>({ kind: 'locating' });
  const [route, setRoute] = useState<RouteState>({ kind: 'idle' });
  const [ride, setRide] = useState<RideState>({ kind: 'none' });
  const [picked, setPicked] = useState<GoMode | null>(null);

  const targetKey = target === null ? null : JSON.stringify(target);
  useEffect(() => {
    if (target === null) {
      setPlace(null);
      return undefined;
    }
    let live = true;
    void loadGoPlace(db, target, new Date())
      .catch(() => null)
      .then((loaded) => {
        if (live) setPlace(loaded);
      });
    return () => {
      live = false;
    };
    // `target` is folded into `targetKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, targetKey]);

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
  const hereKey = here === null ? null : `${here.lat},${here.lng}`;
  useEffect(() => {
    if (here === null || !place || !online) return undefined;
    let live = true;
    setRoute({ kind: 'loading' });
    void api.routePreview({ from: here, to: place, tripId: place.tripId }).then((outcome) => {
      if (!live) return;
      setRoute(
        outcome.kind === 'ok'
          ? { kind: 'ready', preview: outcome.value }
          : { kind: outcome.kind === 'offline' ? 'offline' : 'error' },
      );
    });
    if (place.tripId !== null) {
      setRide({ kind: 'loading' });
      void api
        .rideQuote({ tripId: place.tripId, toPoi: place.poiId, from: here })
        .then((outcome) => {
          if (live)
            setRide(
              outcome.kind === 'ok' ? { kind: 'ready', quote: outcome.value } : { kind: 'none' },
            );
        });
    }
    return () => {
      live = false;
    };
    // `here` is folded into `hereKey`; `api` is fixed per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereKey, place, online]);

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
