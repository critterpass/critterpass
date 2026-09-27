/**
 * `POST /v1/devices/{id}/action-keys` and `DELETE …` (docs/api-contracts.md §5.2,
 * docs/api-contracts-async.md §5): the signed-in app issues (or rotates) the HMAC key its
 * extensions and receivers sign `/v1/actions` requests with, and revokes every key of an install it
 * removes. Both require a session and an install the caller owns (checked as app_user, so the
 * `devices` owner policy decides); the secret is returned once and never stored in plain text.
 */
import { withUser } from '@cp/db';
import { ACTION_KEY_SCOPES, DomainError, type ActionKeyScope } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import { issueActionKey, rotateActionKeyIfDue } from '../auth/action-keys/issue';
import { revokeActionKeysForDevice } from '../auth/action-keys/revoke';
import { ErrorBodySchema, validationHook } from '../commands/_framework/doors';
import { enforceUidRateLimit, requireCommandSession } from '../commands/_framework/session';
import type { ActionRouteDeps } from './actions';

/** Issuing is rare (first launch, a rotation every ~23 d); a burst beyond this is a runaway client. */
const ISSUE_PER_UID_RULE = { windowSeconds: 3600, max: 20 };

const scopeSchema = z.enum(ACTION_KEY_SCOPES);

const IssueBodySchema = z
  .object({
    scopes: z.array(scopeSchema).min(1).optional(),
    rotate_key_id: z.string().min(1).optional(),
  })
  .openapi('IssueActionKey', {
    description: 'Omit scopes for every scope; pass rotate_key_id to rotate an expiring key',
  });

const ActionKeySchema = z
  .object({
    key_id: z.string(),
    secret: z.string().openapi({ description: 'Base64url, 32 bytes; returned only here' }),
    scopes: z.array(z.string()),
    expires_at: z.string(),
  })
  .openapi('ActionKey');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const params = z.object({ id: z.uuid() });

const issueRoute = createRoute({
  method: 'post',
  path: '/v1/devices/{id}/action-keys',
  tags: ['devices'],
  summary: 'Issue or rotate the device action key for one of the caller’s installs',
  request: {
    params,
    body: { required: true, content: { 'application/json': { schema: IssueBodySchema } } },
  },
  responses: {
    201: {
      description: 'The new key; the secret is never returned again',
      content: { 'application/json': { schema: ActionKeySchema } },
    },
    401: errorResponse('AUTH_REQUIRED'),
    404: errorResponse('NOT_FOUND: no such install for this user, or no such key on it'),
    409: errorResponse('STATE_INVALID: rotation is not due yet'),
    429: errorResponse('RATE_LIMITED'),
  },
});

const revokeRoute = createRoute({
  method: 'delete',
  path: '/v1/devices/{id}/action-keys',
  tags: ['devices'],
  summary: 'Revoke every action key of one of the caller’s installs',
  request: { params },
  responses: {
    204: { description: 'Revoked (idempotent)' },
    401: errorResponse('AUTH_REQUIRED'),
    404: errorResponse('NOT_FOUND'),
  },
});

async function requireOwnedDevice(deps: ActionRouteDeps, uid: string, deviceId: string) {
  const { rowCount } = await withUser(deps.pool, uid, deviceId, (tx) =>
    tx.query('SELECT 1 FROM devices WHERE id = $1', [deviceId]),
  );
  if (rowCount !== 1) throw new DomainError('NOT_FOUND', { resource: 'device' });
}

async function requireKeyOnDevice(
  deps: ActionRouteDeps,
  uid: string,
  deviceId: string,
  keyId: string,
): Promise<void> {
  const { rowCount } = await withUser(deps.pool, uid, deviceId, (tx) =>
    tx.query('SELECT 1 FROM device_action_keys WHERE key_id = $1 AND device_id = $2', [
      keyId,
      deviceId,
    ]),
  );
  if (rowCount !== 1) throw new DomainError('NOT_FOUND', { resource: 'action_key' });
}

export function registerActionKeyRoutes(app: OpenAPIHono<AppEnv>, deps: ActionRouteDeps): void {
  app.openapi(
    issueRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      await enforceUidRateLimit(deps.redis, 'action_keys', session.uid, ISSUE_PER_UID_RULE);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      await requireOwnedDevice(deps, session.uid, id);

      let issued;
      if (body.rotate_key_id !== undefined) {
        await requireKeyOnDevice(deps, session.uid, id, body.rotate_key_id);
        issued = await rotateActionKeyIfDue(deps.pool, body.rotate_key_id, deps.keyring);
        if (issued === undefined) {
          throw new DomainError('STATE_INVALID', { reason: 'rotation_not_due' });
        }
      } else {
        const scopes: readonly ActionKeyScope[] = body.scopes ?? ACTION_KEY_SCOPES;
        issued = await issueActionKey(
          deps.pool,
          { userId: session.uid, deviceId: id, scopes: [...new Set(scopes)] },
          deps.keyring,
        );
      }
      return c.json(
        {
          key_id: issued.keyId,
          secret: issued.secret,
          scopes: [...issued.scopes],
          expires_at: issued.expiresAt.toISOString(),
        },
        201,
      );
    },
    validationHook,
  );

  app.openapi(
    revokeRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const { id } = c.req.valid('param');
      await requireOwnedDevice(deps, session.uid, id);
      await revokeActionKeysForDevice(deps.pool, id);
      return c.body(null, 204);
    },
    validationHook,
  );
}
