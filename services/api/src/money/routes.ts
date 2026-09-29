/**
 * Mounts what the money area needs the field keyring for: the payout method command and the
 * payout reads. Without `FIELD_ENCRYPTION_KEYS` neither exists (payout details are never stored
 * unencrypted). Also checks the `cp.money` push actions against the registry, and mounts the
 * receipt upload behind its flag.
 */
import type { crypto as dbCrypto } from '@cp/db';
import { userPid } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import type { CommandRegistry } from '../commands/_framework/registry';
import type { SessionResolver } from '../commands/_framework/session';
import { createSetPayoutMethodCommand } from '../commands/money/set-payout-method';
import { createFlagService } from '../obs/flags';
import { registerPayoutRoutes } from '../routes/payout-reveal';
import { registerReceiptRoutes } from '../routes/receipts';
import { assertMoneyPushActions } from './push-actions';

export interface MoneyRouteDeps {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
  readonly keyring: dbCrypto.FieldEncryptionKeyring;
}

export function registerMoneyRoutes(app: OpenAPIHono<AppEnv>, deps: MoneyRouteDeps): void {
  deps.registry.register(createSetPayoutMethodCommand({ keyring: deps.keyring }));
  registerPayoutRoutes(app, deps);
  assertMoneyPushActions(deps.registry);
}

/**
 * Mounts `POST /v1/receipts` behind the `money.receipts` flag, evaluated per member (PostHog; off
 * when PostHog is unreachable or unset, so scans stay off until the flag is turned on).
 */
export function registerReceiptRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<MoneyRouteDeps, 'pool' | 'sessions'>,
  env: Readonly<Record<string, string | undefined>>,
): void {
  const flags = createFlagService({
    projectApiKey: env['POSTHOG_PROJECT_API_KEY'],
    flagsSecretKey: env['POSTHOG_PROJECT_SECRET_KEY'],
    host: env['POSTHOG_HOST'],
  });
  const salt = env['ANALYTICS_PID_SALT'];
  registerReceiptRoutes(app, {
    ...deps,
    receiptsOn: async (uid) => {
      if (salt === undefined || salt.length < 16) return false;
      try {
        const values = await flags.evaluate({ distinctId: await userPid(uid, salt) });
        return values['money.receipts'] === true;
      } catch {
        return false;
      }
    },
  });
}
