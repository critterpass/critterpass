/**
 * Supplier jobs: the daily affiliate conversions import (only where the Travelpayouts token is
 * set). Registering them also sets the click retention: 13 months after the click.
 */
import { createSqlSupplierCallAudit, createSupplierHttp } from '@cp/suppliers';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { AnyJobDefinition, JobLogger } from '../../boss';
import { registerRetentionRule } from '../maint/retention-rules';
import { affiliateConversionsJob } from './affiliate-conversions';

export interface SupplierJobsEnv {
  readonly TRAVELPAYOUTS_TOKEN?: string | undefined;
}

let wired = false;

function wireSuppliers(): void {
  if (wired) return;
  wired = true;
  registerRetentionRule({
    kind: 'direct',
    table: 'affiliate_clicks',
    column: 'clicked_at',
    ttlDays: 396,
  });
}

export function supplierJobs(
  env: SupplierJobsEnv,
  pool: pg.Pool,
  logger: JobLogger,
): AnyJobDefinition[] {
  wireSuppliers();
  const token = env.TRAVELPAYOUTS_TOKEN;
  if (token === undefined || token === '') {
    logger.warn({}, 'supplier.affiliate_conversions is disabled: TRAVELPAYOUTS_TOKEN is unset');
    return [];
  }
  const http = createSupplierHttp({
    audit: createSqlSupplierCallAudit(
      (sql, params) => withSystem(pool, (tx) => tx.query(sql, [...params])),
      (error) => logger.warn({ err: error }, 'supplier call audit write failed'),
    ),
  });
  return [affiliateConversionsJob({ http, token })];
}
