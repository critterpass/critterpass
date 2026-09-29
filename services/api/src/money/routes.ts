/**
 * Mounts what the money area needs the field keyring for: the payout method command and the
 * payout reads. Without `FIELD_ENCRYPTION_KEYS` neither exists (payout details are never stored
 * unencrypted). Also checks the `cp.money` push actions against the registry.
 */
import type { crypto as dbCrypto } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import type { CommandRegistry } from '../commands/_framework/registry';
import type { SessionResolver } from '../commands/_framework/session';
import { createSetPayoutMethodCommand } from '../commands/money/set-payout-method';
import { registerPayoutRoutes } from '../routes/payout-reveal';
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
