/**
 * Flight status jobs: AeroAPI alert events, the schedule checks, the boarding ping and the watch
 * sweep, over whichever providers the environment configures (`AEROAPI_KEY`, `AERODATABOX_KEY`;
 * names only in services/worker/.env.example). With neither, flights keep their scheduled times and
 * the traveller's own "landed".
 */
import { withSystem } from '@cp/db';
import {
  createAeroApiClient,
  createAeroDataBoxClient,
  createSqlSupplierCallAudit,
  createSupplierHttp,
} from '@cp/suppliers';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { boardingScheduleJob } from './boarding-schedule';
import { flightEventJob } from './flight-event';
import { flightPollJob, type FlightProviders } from './flight-poll';
import { registerFlightPushes } from './pushes';
import { watchSweepJob } from './watch-sweep';

export function flightProvidersFromEnv(
  source: Readonly<Record<string, string | undefined>>,
  pool: pg.Pool,
): FlightProviders {
  // Every provider call is audited (and counted per call) in ops.supplier_calls.
  const http = createSupplierHttp({
    audit: createSqlSupplierCallAudit((sql, params) =>
      withSystem(pool, (tx) => tx.query(sql, [...params])),
    ),
  });
  const aeroKey = source['AEROAPI_KEY'];
  const adbKey = source['AERODATABOX_KEY'];
  return {
    aero: aeroKey ? createAeroApiClient(http, { apiKey: aeroKey }) : undefined,
    adb: adbKey ? createAeroDataBoxClient(http, { apiKey: adbKey }) : undefined,
  };
}

export function flightJobs(providers: FlightProviders): AnyJobDefinition[] {
  registerFlightPushes();
  return [
    flightEventJob(providers.aero),
    flightPollJob(providers),
    boardingScheduleJob(),
    watchSweepJob(providers.aero),
  ];
}
