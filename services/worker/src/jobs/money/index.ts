/**
 * Money jobs: the ledger re-rate after a settlement currency change, the daily auto-confirm, and
 * the receipt parse (DeepSeek fast tier through the gateway; without a key, scans go manual).
 * Uncommitted receipt scans older than a year are purged.
 */
import { createGateway, recordUsage, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore } from '../avatar/media-store';
import { registerRetentionRule } from '../maint/retention-rules';
import { autoconfirmJob } from './autoconfirm';
import { receiptParseJob } from './receipt-parse';
import { rerateJob } from './rerate';

export { registerMoneyPushes } from './pushes';

registerRetentionRule({
  kind: 'direct',
  table: 'receipts',
  column: 'created_at',
  ttlDays: 366,
  where: 'expense_id IS NULL',
});

export interface MoneyJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

export interface MoneyJobsDeps {
  readonly pool: pg.Pool;
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
}

export function moneyJobs(env: MoneyJobsEnv, deps: MoneyJobsDeps): AnyJobDefinition[] {
  const apiKey = env.ANTHROPIC_API_KEY;
  const gateway =
    apiKey === undefined
      ? undefined
      : createGateway({
          apiKey,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
          onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
          assertRouteOn: deps.assertRouteOn,
        });
  const store =
    env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? createAvatarMediaStore({
          endpoint: env.R2_S3_ENDPOINT,
          bucket: env.R2_BUCKET,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        })
      : undefined;
  return [
    rerateJob(),
    autoconfirmJob(),
    receiptParseJob({ gatewayFor: gateway === undefined ? undefined : () => gateway, store }),
  ];
}
