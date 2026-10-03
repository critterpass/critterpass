/**
 * Keeps the app-wide engine fed while the session runs: watches the synced trip, home country,
 * open share and today's plan, rebuilds the engine inputs, and re-evaluates every minute (trip
 * windows and share windows end on the clock, not on a row change). The route layer supplies the
 * native session, the upload and the row watcher.
 */
import { toCountryCode, type LocationLevel } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import {
  activeShare,
  dayPlan,
  HOME_TABLES,
  homeSql,
  PLAN_POI_TABLES,
  planPoiSql,
  SHARE_TABLES,
  shareSql,
  toTripModeTrip,
  TRIP_TABLES,
  tripSql,
  type DayPlan,
  type PlanPoiRow,
  type ShareRow,
  type TripRow,
} from './bridge-inputs';
import { createLocationEngine, type LocationEngine, type SessionSummary } from './engine';
import { coarsePosition } from './geocode';
import type { FixUploader, LocationSessionPort } from './ports';
import { withQuestPlaces, type PlaceFetcher } from './quest-places';
import { setLocationEngine } from './use-location-status';
import { useQuestPlaces } from './use-quest-places';
import { useRows, type RowWatcher } from './use-rows';

export type { RowWatcher } from './use-rows';

export interface EngineBridgeDeps {
  readonly session: LocationSessionPort;
  readonly upload: FixUploader;
  readonly platform: 'ios' | 'android';
  readonly watch: RowWatcher;
  readonly uid: string | null;
  readonly level: LocationLevel;
  readonly appActive: boolean;
  readonly deviceTz: string;
  readonly exploreAtHome: boolean;
  readonly androidBackgroundGeofences: boolean;
  readonly countryOf?: (lat: number, lng: number) => Promise<string | null>;
  /** One coarse position with no session running; the device's own by default. */
  readonly locate?: () => Promise<{ readonly lat: number; readonly lng: number } | null>;
  readonly highAccuracyCapMs?: number;
  readonly onSessionEnded?: (summary: SessionSummary) => void;
  readonly now?: () => number;
  /** A place's point from the server, for a quest place the phone has no copy of. */
  readonly fetchPlace?: PlaceFetcher;
}

export function useLocationEngineBridge(deps: EngineBridgeDeps): {
  readonly engine: LocationEngine;
  readonly plan: DayPlan | null;
} {
  const now = deps.now ?? Date.now;
  const [engine] = useState(() =>
    createLocationEngine({
      session: deps.session,
      upload: deps.upload,
      platform: deps.platform,
      now,
      ...(deps.countryOf
        ? { countryOf: deps.countryOf, locate: deps.locate ?? coarsePosition }
        : {}),
      highAccuracyCapMs: () => deps.highAccuracyCapMs,
      ...(deps.onSessionEnded ? { onSessionEnded: deps.onSessionEnded } : {}),
    }),
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLocationEngine(engine);
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => {
      clearInterval(timer);
      setLocationEngine(null);
      void engine.dispose();
    };
  }, [engine]);

  const uid = deps.uid;
  const tripRows = useRows<TripRow>(deps.watch, uid ? tripSql(uid) : null, TRIP_TABLES);
  const homeRows = useRows<{ home_country: string | null }>(
    deps.watch,
    uid ? homeSql(uid) : null,
    HOME_TABLES,
  );
  const shareRows = useRows<ShareRow>(deps.watch, uid ? shareSql(uid) : null, SHARE_TABLES);
  const tripRow = tripRows[0];
  const planRows = useRows<PlanPoiRow>(
    deps.watch,
    tripRow ? planPoiSql(tripRow.id) : null,
    PLAN_POI_TABLES,
  );

  const tz = tripRow?.tz ?? deps.deviceTz;
  const questPlaces = useQuestPlaces({
    watch: deps.watch,
    tripId: tripRow?.id ?? null,
    tz,
    now,
    tick,
    ...(deps.fetchPlace ? { fetchPlace: deps.fetchPlace } : {}),
  });

  const plan = useMemo(
    () => (tripRow ? withQuestPlaces(dayPlan(tripRow.id, planRows, now(), tz), questPlaces) : null),
    // `tick` re-derives today's plan when the local day turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tripRow, planRows, tz, questPlaces, tick],
  );

  useEffect(() => {
    void engine.update({
      trip: toTripModeTrip(tripRow),
      homeCountry: toCountryCode(homeRows[0]?.home_country),
      exploreAtHome: deps.exploreAtHome,
      deviceTz: deps.deviceTz,
      level: deps.level,
      share: activeShare(shareRows, now()),
      appActive: deps.appActive,
      geofenceContext: plan?.context ?? null,
      androidBackgroundGeofences: deps.androidBackgroundGeofences,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    engine,
    tripRow,
    homeRows,
    shareRows,
    plan,
    tick,
    deps.level,
    deps.appActive,
    deps.exploreAtHome,
    deps.deviceTz,
    deps.androidBackgroundGeofences,
  ]);

  return { engine, plan };
}
