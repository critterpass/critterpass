/**
 * Billing's wiring into the api process: the RevenueCat client and webhook (both only when their
 * secrets are set: no key, no purchase verification, and entitlements keep resolving from codes
 * and first trip free), the entitlement sources, the purchase commands and the internal door the
 * worker's billing jobs call. Secrets come from the environment and are never logged.
 */
import { onEventAppended, withSystem } from '@cp/db';
import { DomainError } from '@cp/domain';
import { BILLING_TRIP_LOADERS, BILLING_USER_LOADERS, type RunQuery } from '@cp/entitlements';
import type { Hono } from 'hono';
import type pg from 'pg';
import type { Logger } from 'pino';
import { z } from 'zod';

import { registerBillingCommands } from '../commands/billing';
import { registerBoostCommands } from '../commands/boost';
import { expireIntent } from '../commands/boost/release-boost-intent';
import type { CommandRegistry } from '../commands/_framework/registry';
import { registerTripSourceLoader, registerUserSourceLoader } from '../entitlements';
import { createKillSwitches } from '../ops/kill-switches';
import { registerRevenueCatWebhook } from '../routes/webhooks/revenuecat';
import { activateBoostPurchase } from './activate-boost';
import { applyBillingEvent } from './apply-event';
import { expireBoost, onTripChanged } from './boost-lifecycle';
import { revokeBoostPurchase } from './boost-revoke';
import { crewYearChanged } from './crew-year';
import { closeFirstTripFree, grantFirstTripFree } from './ftf-eligibility';
import { registerPurchaseHandler } from './fulfilment';
import { billingTripHook } from './trip-hooks';
import { registerBillingDoor, type BillingOpHandler } from './internal-door';
import { createRevenueCatClient, type RevenueCatClient } from './rc-client';
import { reconcileBatch } from './reconcile';

const optional = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(16).optional(),
);

export const billingEnvSchema = z.object({
  /** RevenueCat secret API key (REST reads of a customer). */
  REVENUECAT_SECRET_API_KEY: optional,
  /** The exact Authorization header value configured on RevenueCat's webhook. */
  REVENUECAT_WEBHOOK_AUTH: optional,
  /** RevenueCat's webhook signing secret, when signing is on. */
  REVENUECAT_WEBHOOK_SIGNING_SECRET: optional,
  /** Shared with the worker: authenticates its calls to the internal billing door. */
  BILLING_INTERNAL_SECRET: optional,
});
export type BillingEnv = z.infer<typeof billingEnvSchema>;

let sourcesRegistered = false;

/** Adapts a pg transaction to the loaders' read function. */
export const runOn =
  (tx: pg.PoolClient): RunQuery =>
  async <Row>(sql: string, values: readonly unknown[]) =>
    (await tx.query(sql, [...values])).rows as Row[];

/**
 * Registers every billing entitlement source with the materialiser and every product's purchase
 * handler (once per process).
 */
export function registerBillingSources(): void {
  if (sourcesRegistered) return;
  sourcesRegistered = true;
  registerPurchaseHandler('boost_trip', {
    fulfil: activateBoostPurchase,
    revoke: revokeBoostPurchase,
  });
  registerPurchaseHandler('crew_year', { subscriptionChanged: crewYearChanged });
  onEventAppended(billingTripHook);
  for (const loader of BILLING_USER_LOADERS) {
    registerUserSourceLoader(({ tx, uid }) => loader(runOn(tx), uid));
  }
  for (const loader of BILLING_TRIP_LOADERS) {
    registerTripSourceLoader(({ tx, tripId, crewId }) => loader(runOn(tx), { tripId, crewId }));
  }
}

export interface BillingProcessDeps {
  readonly pool: pg.Pool;
  readonly revenuecat: RevenueCatClient | undefined;
  readonly logger: Pick<Logger, 'warn'>;
}

/** Each internal door step; later billing modules add theirs. */
export function billingOps(deps: BillingProcessDeps): Partial<Record<string, BillingOpHandler>> {
  return {
    apply_event: async (body) => {
      const { billing_event_id: id } = body as { billing_event_id: string };
      try {
        return await withSystem(deps.pool, (tx) =>
          applyBillingEvent(tx, { revenuecat: deps.revenuecat }, id),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : 'failed';
        await withSystem(deps.pool, (tx) =>
          tx.query('UPDATE billing_events SET attempts = attempts + 1, error = $2 WHERE id = $1', [
            id,
            message,
          ]),
        );
        throw error;
      }
    },
    expire_boost: (body) => {
      const { boost_id: id } = body as { boost_id: string };
      return withSystem(deps.pool, async (tx) => {
        try {
          return await expireBoost(tx, id, new Date());
        } catch (error) {
          // The same timer kind closes a first-trip-free window.
          if (!(error instanceof DomainError) || error.code !== 'NOT_FOUND') throw error;
          return { ftf_closed: await closeFirstTripFree(tx, id, new Date()) };
        }
      });
    },
    grant_ftf: (body) => {
      const { trip_id: id } = body as { trip_id: string };
      return withSystem(deps.pool, (tx) => grantFirstTripFree(tx, id, new Date()));
    },
    trip_changed: (body) => {
      const { trip_id: id } = body as { trip_id: string };
      return withSystem(deps.pool, (tx) => onTripChanged(tx, id, new Date()));
    },
    expire_intent: (body) => {
      const { intent_id: id } = body as { intent_id: string };
      return withSystem(deps.pool, (tx) => expireIntent(tx, id, new Date()));
    },
    reconcile: (body) => {
      const { after_user_id: after, limit } = body as {
        after_user_id: string | null;
        limit: number;
      };
      return reconcileBatch(
        {
          pool: deps.pool,
          revenuecat: deps.revenuecat,
          onError: (error, uid) =>
            deps.logger.warn({ err: error, uid }, 'billing reconcile failed'),
        },
        after,
        limit,
      );
    },
  };
}

export interface RegisterBillingInput<E extends { Variables: object }> {
  readonly app: Hono<E>;
  readonly commands: CommandRegistry;
  readonly pool: pg.Pool;
  readonly logger: Pick<Logger, 'warn' | 'error' | 'info'>;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export function registerBilling<E extends { Variables: object }>(
  input: RegisterBillingInput<E>,
): void {
  const env = billingEnvSchema.parse(input.env ?? process.env);
  const revenuecat =
    env.REVENUECAT_SECRET_API_KEY === undefined
      ? undefined
      : createRevenueCatClient({ secretKey: env.REVENUECAT_SECRET_API_KEY });
  if (revenuecat === undefined) {
    input.logger.warn('Store purchase verification is off: REVENUECAT_SECRET_API_KEY is unset');
  }
  registerBillingSources();
  const switches = createKillSwitches(input.pool);
  registerBillingCommands(input.commands, { revenuecat, switches });
  registerBoostCommands(input.commands, { switches });
  if (env.REVENUECAT_WEBHOOK_AUTH === undefined) {
    input.logger.warn('The RevenueCat webhook is off: REVENUECAT_WEBHOOK_AUTH is unset');
  } else {
    registerRevenueCatWebhook(input.app, {
      pool: input.pool,
      authorization: env.REVENUECAT_WEBHOOK_AUTH,
      signingSecret: env.REVENUECAT_WEBHOOK_SIGNING_SECRET,
    });
  }
  if (env.BILLING_INTERNAL_SECRET === undefined) {
    input.logger.warn('The internal billing door is off: BILLING_INTERNAL_SECRET is unset');
    return;
  }
  const processDeps = { pool: input.pool, revenuecat, logger: input.logger };
  registerBillingDoor(input.app, {
    secret: env.BILLING_INTERNAL_SECRET,
    ops: billingOps(processDeps),
    onError: (error, op) => input.logger.warn({ err: error, op }, 'billing door step failed'),
  });
}
