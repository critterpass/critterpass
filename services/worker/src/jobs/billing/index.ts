/**
 * Billing jobs. They run only when the worker can reach the api's internal billing door
 * (`API_INTERNAL_URL` and `BILLING_INTERNAL_SECRET`, the same secret the api holds); without them
 * the queues keep their jobs until the door is configured and the jobs are redriven.
 */
import { z } from 'zod';

import type { AnyJobDefinition } from '../../boss';
import type { MetricsRecorder } from '../../obs/metrics';
import { billingApplyJob } from './apply';
import { boostExpireJob, ftfGrantJob, tripChangedJob } from './boost-expire';
import { createBillingDoor, type BillingDoor } from './door-client';
import { intentExpiryJob } from './intent-expiry';
import { billingReconcileJob } from './reconcile';

const envSchema = z.object({
  API_INTERNAL_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  BILLING_INTERNAL_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(16).optional(),
  ),
});

export function billingJobsFor(
  door: BillingDoor,
  metrics?: Pick<MetricsRecorder, 'record'>,
): AnyJobDefinition[] {
  return [
    billingApplyJob(door, metrics),
    billingReconcileJob(door, metrics),
    intentExpiryJob(door),
    boostExpireJob(door),
    ftfGrantJob(door),
    tripChangedJob(door),
  ];
}

export function billingJobs(
  env: Readonly<Record<string, string | undefined>>,
  logger: { warn(message: string): void },
  metrics?: Pick<MetricsRecorder, 'record'>,
): AnyJobDefinition[] {
  const parsed = envSchema.parse(env);
  if (parsed.API_INTERNAL_URL === undefined || parsed.BILLING_INTERNAL_SECRET === undefined) {
    logger.warn('Billing jobs are off: API_INTERNAL_URL or BILLING_INTERNAL_SECRET is unset');
    return [];
  }
  return billingJobsFor(
    createBillingDoor({ baseUrl: parsed.API_INTERNAL_URL, secret: parsed.BILLING_INTERNAL_SECRET }),
    metrics,
  );
}
