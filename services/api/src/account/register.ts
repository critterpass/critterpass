/**
 * The account area on the api (docs/api-contracts-you.md): the deletion command, which needs the
 * app's Better Auth instance to end sessions and revoke provider tokens, and the `/v1/me/*` reads.
 * The commands that need only the database register with the rest of the catalogue.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import type { AuthModule } from '../auth';
import type { buildFieldEncryptionKeyringFromEnv } from '../auth/bootstrap';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { createRequestAccountDeletionCommand } from '../commands/account';
import type { ApiEnv } from '../env';
import { mediaSigningConfigFromEnv } from '../media/sign';
import { registerMeAccountRoutes } from '../routes/me-account';
import { createAccountAuthControl } from './auth-control';

export interface AccountAreaDeps {
  readonly doors: CommandDoorDeps;
  readonly auth: AuthModule['auth'];
  readonly env: ApiEnv;
  readonly keyring: ReturnType<typeof buildFieldEncryptionKeyringFromEnv>;
}

export function registerAccount(app: OpenAPIHono<AppEnv>, deps: AccountAreaDeps): void {
  const { env } = deps;
  const control = createAccountAuthControl(deps.auth, env, deps.keyring);
  deps.doors.registry.register(createRequestAccountDeletionCommand(control));
  const signing =
    env.MEDIA_PUBLIC_BASE_URL && env.MEDIA_HMAC_KEYS && env.MEDIA_HMAC_ACTIVE_KID
      ? mediaSigningConfigFromEnv({
          baseUrl: env.MEDIA_PUBLIC_BASE_URL,
          keysJson: env.MEDIA_HMAC_KEYS,
          activeKeyId: env.MEDIA_HMAC_ACTIVE_KID,
        })
      : undefined;
  registerMeAccountRoutes(app, { ...deps.doors, signing });
}
