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
import type { FixUploader, LocationSessionPort } from './ports';
import { setLocationEngine } from './use-location-status';

export type RowWatcher = <Row>(
  sql: string,
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
) => () => void;

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
  readonly highAccuracyCapMs?: number;
  readonly onSessionEnded?: (summary: SessionSummary) => void;
  readonly now?: () => number;
}

const NO_ROWS: never[] = [];

function useRows<Row>(watch: RowWatcher, sql: string | null, tables: readonly string[]): Row[] {
  const [state, setState] = useState<{ readonly sql: string | null; readonly rows: Row[] }>({
    sql: null,
    rows: [],
  });
  useEffect(() => {
    if (sql === null) return undefined;
    return watch<Row>(sql, tables, (rows) => setState({ sql, rows }));
    // `tables` is a module constant at every call site; the query identity is `sql`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, sql]);
  // Rows of an earlier query (another trip, a signed-out user) never leak into the next one.
  return sql !== null && state.sql === sql ? state.rows : NO_ROWS;
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
      ...(deps.countryOf ? { countryOf: deps.countryOf } : {}),
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

  const plan = useMemo(
    () => (tripRow ? dayPlan(tripRow.id, planRows, now(), tripRow.tz ?? deps.deviceTz) : null),
    // `tick` re-derives today's plan when the local day turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tripRow, planRows, deps.deviceTz, tick],
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
