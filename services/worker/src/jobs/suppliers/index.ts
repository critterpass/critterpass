/**
 * Supplier jobs: the hold expiry timer (always: an order can only hold while the Viator switch is
 * on, but its timer must fire whatever happens to the switch after), the Viator status poll (where
 * the api's settle door is reachable) and the daily affiliate conversions import (where the
 * Travelpayouts token is set). Registering them also sets the click retention (13 months) and the
 * Grab quote retention (7 days). The reading of vendor replies registers apart
 * (`replyParseJobs`), with the AI route switches it needs.
 */
import {
  createDecisionClient,
  createGateway,
  recordUsage,
  type AssertRouteOn,
  type Telemetry,
} from '@cp/ai';
import { createSqlSupplierCallAudit, createSupplierHttp } from '@cp/suppliers';
import { withSystem } from '@cp/db';
import type { DecisionRoute } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition, JobLogger } from '../../boss';
import { registerRetentionRule } from '../maint/retention-rules';
import { affiliateConversionsJob } from './affiliate-conversions';
import { holdExpiryJob } from './hold-expiry';
import { vendorReplyParseJob } from './vendor-reply-parse';
import { createSettleDoor, viatorPollJob } from './viator-poll';

export interface SupplierJobsEnv {
  readonly TRAVELPAYOUTS_TOKEN?: string | undefined;
  readonly API_INTERNAL_URL?: string | undefined;
  readonly SUPPLIERS_INTERNAL_SECRET?: string | undefined;
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
  registerRetentionRule({ kind: 'direct', table: 'ride_quotes', column: 'fetched_at', ttlDays: 7 });
}

export interface ReplyParseEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
}

/** `vendor.reply_parse`, on Jev with its DeepSeek twin; with no model key every reply goes to the desk. */
export function replyParseJobs(
  env: ReplyParseEnv,
  pool: pg.Pool,
  ai: { readonly assertAiRoute: AssertRouteOn },
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  const assertRouteOn = ai.assertAiRoute;
  const onUsage = (record: Parameters<typeof recordUsage>[1]) =>
    recordUsage((fn) => withSystem(pool, fn), record);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          ...(telemetry === undefined ? {} : { telemetry }),
          onUsage,
          assertRouteOn,
        });
  const decisions =
    gateway === undefined && env.TYPESAFE_API_KEY === undefined
      ? undefined
      : createDecisionClient({
          apiKey: env.TYPESAFE_API_KEY,
          ...(gateway === undefined ? {} : { gateway }),
          onUsage,
          assertRouteOn: (route: DecisionRoute) => assertRouteOn(route),
          ...(telemetry === undefined ? {} : { telemetry }),
        });
  return [vendorReplyParseJob(decisions)];
}

/** `env` is the worker's parsed env; the settle door's two keys are read from `raw` like billing's. */
export function supplierJobs(
  parsed: Pick<SupplierJobsEnv, 'TRAVELPAYOUTS_TOKEN'>,
  pool: pg.Pool,
  logger: JobLogger,
  raw: Readonly<Record<string, string | undefined>> = process.env,
): AnyJobDefinition[] {
  wireSuppliers();
  const env: SupplierJobsEnv = {
    TRAVELPAYOUTS_TOKEN: parsed.TRAVELPAYOUTS_TOKEN,
    API_INTERNAL_URL: raw['API_INTERNAL_URL'],
    SUPPLIERS_INTERNAL_SECRET: raw['SUPPLIERS_INTERNAL_SECRET'],
  };
  const jobs: AnyJobDefinition[] = [holdExpiryJob()];
  if (env.API_INTERNAL_URL && env.SUPPLIERS_INTERNAL_SECRET) {
    jobs.push(
      viatorPollJob(
        createSettleDoor({ baseUrl: env.API_INTERNAL_URL, secret: env.SUPPLIERS_INTERNAL_SECRET }),
      ),
    );
  } else {
    logger.warn(
      {},
      'supplier.viator_poll is off: API_INTERNAL_URL or SUPPLIERS_INTERNAL_SECRET is unset',
    );
  }
  const token = env.TRAVELPAYOUTS_TOKEN;
  if (token === undefined || token === '') {
    logger.warn({}, 'supplier.affiliate_conversions is off: TRAVELPAYOUTS_TOKEN is unset');
    return jobs;
  }
  const http = createSupplierHttp({
    audit: createSqlSupplierCallAudit(
      (sql, params) => withSystem(pool, (tx) => tx.query(sql, [...params])),
      (error) => logger.warn({ err: error }, 'supplier call audit write failed'),
    ),
  });
  jobs.push(affiliateConversionsJob({ http, token }));
  return jobs;
}
