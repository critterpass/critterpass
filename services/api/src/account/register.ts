/**
 * The account area on the api (docs/api-contracts-you.md): the deletion command, which needs the
 * app's Better Auth instance to end sessions and revoke provider tokens, the `/v1/me/*` reads,
 * the purge route and the signed link to a ready data export. The commands that need only the database register with the rest of the
 * catalogue.
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
import { registerExportLinkRoute } from './export-link';

export interface AccountAreaDeps {
  readonly doors: CommandDoorDeps;
  readonly auth: AuthModule['auth'];
  readonly env: ApiEnv;
  readonly keyring: ReturnType<typeof buildFieldEncryptionKeyringFromEnv>;
}

export function registerAccount(app: OpenAPIHono<AppEnv>, deps: AccountAreaDeps): void {
  const control = createAccountAuthControl(deps.auth, deps.env, deps.keyring, deps.doors.pool);
  deps.doors.registry.register(createRequestAccountDeletionCommand(control));
  registerMeAccountRoutes(app, { ...deps.doors, control, appEnv: deps.env.APP_ENV });
  // The export link needs the media Worker's signing keys; without them no link can be minted.
  const { MEDIA_PUBLIC_BASE_URL: baseUrl, MEDIA_HMAC_KEYS: keysJson } = deps.env;
  const activeKeyId = deps.env.MEDIA_HMAC_ACTIVE_KID;
  if (baseUrl !== undefined && keysJson !== undefined && activeKeyId !== undefined) {
    registerExportLinkRoute(app, {
      ...deps.doors,
      signing: mediaSigningConfigFromEnv({ baseUrl, keysJson, activeKeyId }),
    });
  }
}
