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

import type { AnyJobDefinition, JobLogger } from '../boss/define-job';
import type { WorkerEnv } from '../env';
import { faresRefreshJob } from './fares-refresh';
import { seasonIngestJob } from './season-ingest';

export function createAuditedSupplierHttp(pool: pg.Pool, logger: JobLogger): SupplierHttp {
  return createSupplierHttp({
    audit: createSqlSupplierCallAudit(
      (sql, params) => withSystem(pool, (tx) => tx.query(sql, [...params])),
      (error) => logger.warn({ err: error }, 'supplier call audit write failed'),
    ),
  });
}

export function travelDataJobs(
  env: Pick<WorkerEnv, 'TRAVELPAYOUTS_TOKEN' | 'WEATHERAPI_KEY'>,
  pool: pg.Pool,
  logger: JobLogger,
): AnyJobDefinition[] {
  const http = createAuditedSupplierHttp(pool, logger);
  const jobs: AnyJobDefinition[] = [seasonIngestJob()];
  const token = env.TRAVELPAYOUTS_TOKEN;
  if (token === undefined) {
    logger.warn({}, 'fares.refresh is disabled: TRAVELPAYOUTS_TOKEN is unset');
  } else {
    jobs.push(faresRefreshJob((query, signal) => fetchFareMonth(http, { token }, query, signal)));
  }
  return jobs;
}
