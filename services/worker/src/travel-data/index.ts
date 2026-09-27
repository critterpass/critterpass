/**
 * Travel-data jobs (docs/api-contracts-async.md §2.3): each supplier-backed refresh is registered
 * only when its key is configured, and every outbound call is audited in `ops.supplier_calls`.
 */
import { withSystem } from '@cp/db';
import {
  createSqlSupplierCallAudit,
  createSupplierHttp,
  fetchFareMonth,
  type SupplierHttp,
} from '@cp/suppliers';
import type pg from 'pg';

import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../boss/define-job';
import type { WorkerEnv } from '../env';
import { crowdsRefreshJob } from './crowds-refresh';
import { faresRefreshJob } from './fares-refresh';
import { seasonIngestJob } from './season-ingest';
import { refreshWeather, type WeatherSource } from './weather-refresh';
import { fetchForecast, fetchMarine } from './weatherapi-client';

export function createAuditedSupplierHttp(pool: pg.Pool, logger: JobLogger): SupplierHttp {
  return createSupplierHttp({
    audit: createSqlSupplierCallAudit(
      (sql, params) => withSystem(pool, (tx) => tx.query(sql, [...params])),
      (error) => logger.warn({ err: error }, 'supplier call audit write failed'),
    ),
  });
}

export interface WeatherJobConfig {
  readonly forecastDays: number;
  readonly marineDays: number;
}

export function weatherRefreshJob(
  source: WeatherSource,
  config: WeatherJobConfig,
): AnyJobDefinition {
  return defineJob({
    queue: 'weather.refresh',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger, job }) {
      const report = await refreshWeather({ pool, source, logger, ...config, signal: job.signal });
      logger.info({ ...report }, 'weather refreshed');
      return { ...report };
    },
  });
}

export function travelDataJobs(
  env: Pick<
    WorkerEnv,
    'TRAVELPAYOUTS_TOKEN' | 'WEATHERAPI_KEY' | 'WEATHERAPI_FORECAST_DAYS' | 'WEATHERAPI_MARINE_DAYS'
  >,
  pool: pg.Pool,
  logger: JobLogger,
): AnyJobDefinition[] {
  const http = createAuditedSupplierHttp(pool, logger);
  const jobs: AnyJobDefinition[] = [seasonIngestJob(), crowdsRefreshJob()];
  const token = env.TRAVELPAYOUTS_TOKEN;
  if (token === undefined) {
    logger.warn({}, 'fares.refresh is disabled: TRAVELPAYOUTS_TOKEN is unset');
  } else {
    jobs.push(faresRefreshJob((query, signal) => fetchFareMonth(http, { token }, query, signal)));
  }
  const key = env.WEATHERAPI_KEY;
  if (key === undefined) {
    logger.warn({}, 'weather.refresh is disabled: WEATHERAPI_KEY is unset');
  } else {
    const source: WeatherSource = {
      forecast: (query, signal) => fetchForecast(http, { key }, query, signal),
      marine: (query, signal) => fetchMarine(http, { key }, query, signal),
    };
    jobs.push(
      weatherRefreshJob(source, {
        forecastDays: env.WEATHERAPI_FORECAST_DAYS,
        marineDays: env.WEATHERAPI_MARINE_DAYS,
      }),
    );
  }
  return jobs;
}
