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
import { bundledAirportAt } from './data/airport';
import { loadGoPlace, type AirportLookup, type GoPlace, type GoTarget } from './data/go-place';
import { useRemoteGoPlace } from './data/remote-go-place';
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
  /** Looks for the phone's position again, now (it is also looked for by itself every few seconds). */
  readonly retryLocate: () => void;
}

/** With location on and no fix yet, how often the phone is asked again while GO stays open. */
export const RELOCATE_EVERY_MS = 5_000;

export function useGoPreview(
  target: GoTarget | null,
  api: GoApi = deviceGoApi,
  airportAt: AirportLookup = bundledAirportAt,
  findMe: (ask: boolean) => Promise<LocateState> = locateForGo,
): GoPreviewData {
  const { db } = useLocalFirst();
  const remote = useRemoteGoPlace();
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
    void loadGoPlace(db, target, new Date(), airportAt, remote)
      .catch(() => null)
      .then((next) => {
        if (live) setLoaded({ key: targetKey, place: next });
      });
    return () => {
      live = false;
    };
    // `target` is folded into `targetKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, remote, targetKey]);
  const place = target === null ? null : loaded?.key === targetKey ? loaded.place : undefined;

  // Each look at where the phone is. A phone with location on and no fix yet is asked again every
  // few seconds, so the route draws by itself when the fix comes; a retry asks at once.
  const [look, setLook] = useState(0);
  useEffect(() => {
    let live = true;
    let again: ReturnType<typeof setTimeout> | undefined;
    void findMe(look === 0).then((next) => {
      if (!live) return;
      setLocate(next);
      if (next.kind === 'no_fix')
        again = setTimeout(() => setLook((n) => n + 1), RELOCATE_EVERY_MS);
    });
    return () => {
      live = false;
      if (again !== undefined) clearTimeout(again);
    };
    // `findMe` is fixed per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look]);
  const retryLocate = () => {
    setLocate({ kind: 'locating' });
    setLook((n) => n + 1);
  };

  const here = locate.kind === 'here' ? locate.at : null;
  // One ask per place and position; a new key reads as loading until its answers land.
  const askKey =
    here === null || !place || !online ? null : `${place.lat},${place.lng}|${here.lat},${here.lng}`;
  useEffect(() => {
    if (askKey === null || here === null || !place) return undefined;
    let live = true;
    const merge = (next: Partial<{ route: RouteState; ride: RideState }>) =>
      setAnswers((was) => ({
        key: askKey,
        route: was?.key === askKey ? was.route : { kind: 'loading' },
        ride:
          was?.key === askKey
            ? was.ride
            : { kind: place.tripId === null || place.poiId === null ? 'none' : 'loading' },
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
    const { tripId, poiId } = place;
    if (tripId !== null && poiId !== null) {
      void api.rideQuote({ tripId, toPoi: poiId, from: here }).then((outcome) => {
        if (!live) return;
        merge({
          ride: outcome.kind === 'ok' ? { kind: 'ready', quote: outcome.value } : { kind: 'none' },
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
  return { place, state, mode, setMode: setPicked, retryLocate };
}
