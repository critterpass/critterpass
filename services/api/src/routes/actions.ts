/**
 * `POST /v1/actions` (docs/api-contracts.md §5.2, docs/api-contracts-async.md §4–§5): the door for
 * widgets, Live Activity intents, notification actions and Android receivers, authenticated by a
 * device action key instead of a session. The body is a normal command envelope; the command must
 * declare an `actionScope` and the key must carry that scope, or the request is refused with
 * `ACTION_KEY_SCOPE`. Past that check the envelope runs through the same pipeline as `/v1/cmd`, so
 * a replayed request (same `op_id`) comes back as `duplicate` rather than running twice.
 *
 * The route reads the raw body itself (no zod-openapi body validator) because the signature covers
 * the exact bytes the client sent.
 */
import { executeCommand, withSystem, type crypto as dbCrypto } from '@cp/db';
import { DomainError, type ActorVia } from '@cp/domain';
import { z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { verifyActionKeyRequest, type VerifiedActionKey } from '../auth/action-keys/verify';
import {
  CommandEnvelopeSchema,
  CommandOutcomeSchema,
  ErrorBodySchema,
  outcomeBody,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import { CMD_PER_UID_RULE, enforceUidRateLimit } from '../commands/_framework/session';
import type { ServerAnalytics } from '../obs/analytics';

export interface ActionRouteDeps extends Omit<CommandDoorDeps, 'logger'> {
  readonly keyring: dbCrypto.FieldEncryptionKeyring;
  /** Test-only clock override for the signature timestamp window. */
  readonly now?: () => number;
  /** `widget_action` for every applied widget action (extensions carry no analytics SDK). */
  readonly analytics?: Pick<ServerAnalytics, 'serverTrack'>;
}

/** The surfaces that reach commands through this door (`actor.via`), never the app or the server. */
const ACTION_VIAS: ReadonlySet<ActorVia> = new Set([
  'widget',
  'notif_action',
  'la_intent',
  'app_intent',
]);

interface ActionEnvelope {
  readonly cmd: string;
  readonly actor: { readonly via: string };
  readonly device: { readonly id: string };
}

function parseEnvelope(raw: string): ActionEnvelope & Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DomainError('VALIDATION', { reason: 'body_not_json' });
  }
  const shape = CommandEnvelopeSchema.safeParse(parsed);
  if (!shape.success) {
    throw new DomainError('VALIDATION', {
      issues: shape.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    });
  }
  return parsed as ActionEnvelope & Record<string, unknown>;
}

/** Verifies an `X-CP-*` signed request for `scope` against the exact raw body. */
export function verifySignedRequest(
  request: Request,
  path: string,
  body: string,
  scope: string,
  deps: Pick<ActionRouteDeps, 'pool' | 'keyring' | 'now'>,
): Promise<VerifiedActionKey> {
  return verifyActionKeyRequest(
    { method: request.method, path, headers: request.headers, body },
    scope,
    { appPool: deps.pool, keyring: deps.keyring, ...(deps.now ? { now: deps.now } : {}) },
  );
}

async function isAnonymousUser(pool: pg.Pool, uid: string): Promise<boolean> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [uid]),
  );
  return rows[0]?.status !== 'registered';
}

export function registerActionsRoute(app: OpenAPIHono<AppEnv>, deps: ActionRouteDeps): void {
  app.openAPIRegistry.registerPath({
    method: 'post',
    path: '/v1/actions',
    tags: ['commands'],
    summary: 'Run one scoped command with a device action key (extensions, widgets, receivers)',
    request: {
      headers: z.object({
        'x-cp-key-id': z.string(),
        'x-cp-ts': z.string().openapi({ description: 'Unix seconds, ±300 s of server time' }),
        'x-cp-sig': z.string().openapi({
          description: 'base64url(HMAC-SHA256(secret, method\\npath\\nts\\nsha256hex(body)))',
        }),
      }),
      body: { required: true, content: { 'application/json': { schema: CommandEnvelopeSchema } } },
    },
    responses: {
      200: {
        description: 'Applied, or a replay of an already-applied op_id',
        content: { 'application/json': { schema: CommandOutcomeSchema } },
      },
      403: {
        description: 'ACTION_KEY_SCOPE: bad signature, stale timestamp, revoked key or scope miss',
        content: { 'application/json': { schema: ErrorBodySchema } },
      },
    },
  });

  app.post('/v1/actions', async (c) => {
    const raw = await c.req.text();
    const envelope = parseEnvelope(raw);
    const definition = deps.registry.resolve(envelope.cmd);
    if (definition === undefined || definition.internal || definition.actionScope === undefined) {
      throw new DomainError('ACTION_KEY_SCOPE', { reason: 'not_an_action' });
    }
    const key = await verifySignedRequest(c.req.raw, c.req.path, raw, definition.actionScope, deps);
    if (envelope.device.id.toLowerCase() !== key.deviceId.toLowerCase()) {
      throw new DomainError('ACTION_KEY_SCOPE', { reason: 'device_mismatch' });
    }
    if (!ACTION_VIAS.has(envelope.actor.via as ActorVia)) {
      throw new DomainError('VALIDATION', { reason: 'actor_via_not_an_action_surface' });
    }
    await enforceUidRateLimit(deps.redis, 'actions', key.userId, CMD_PER_UID_RULE);

    const outcome = await executeCommand(envelope, {
      pool: deps.pool,
      resolve: deps.registry.resolve,
      actor: {
        kind: 'user',
        uid: key.userId,
        isAnonymous: await isAnonymousUser(deps.pool, key.userId),
      },
      door: 'cmd',
    });
    if (outcome.status === 'rejected') throw new DomainError(outcome.code, outcome.detail);
    if (outcome.status === 'duplicate' && outcome.original === 'rejected') {
      throw new DomainError(outcome.code ?? 'INTERNAL', outcome.detail);
    }
    if (envelope.actor.via === 'widget' && outcome.status === 'applied') {
      void deps.analytics?.serverTrack(
        'widget_action',
        { kind: envelope.cmd, surface: 'widget' },
        { uid: key.userId },
      );
    }
    return c.json(outcomeBody(outcome), 200);
  });
}
