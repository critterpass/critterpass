/**
 * `GET /v1/widgets/snapshot?trip_id` (docs/api-contracts.md §5.5): the compact JSON every widget
 * and Live Activity renders from (`@cp/domain` `widgetSnapshotSchema`). Two ways in:
 * - the app, with its session;
 * - the widget extension's push handler, signed with a device action key carrying `read_snapshot`
 *   (X-CP-Key-Id / X-CP-Ts / X-CP-Sig over an empty body, as `POST /v1/actions`).
 * Either way the read runs as app_user for that uid. The ETag covers the content without its
 * clock, so `If-None-Match` answers 304 until something a widget shows has changed.
 */
import { createHash } from 'node:crypto';

import { withUser } from '@cp/db';
import { DomainError, widgetSnapshotContent, type WidgetSnapshot } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import {
  ErrorBodySchema,
  type CommandDoorDeps,
  validationHook,
} from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import { loadWidgetSnapshot } from '../commands/widgets';
import { verifySignedRequest, type ActionRouteDeps } from './actions';

export interface WidgetSnapshotRouteDeps extends Pick<CommandDoorDeps, 'pool' | 'sessions'> {
  /** Absent when action keys are off (no field-encryption keyring): only sessions get in. */
  readonly keyring?: ActionRouteDeps['keyring'];
  readonly now?: () => Date;
}

const route = createRoute({
  method: 'get',
  path: '/v1/widgets/snapshot',
  tags: ['widgets'],
  summary: 'The widget snapshot for the caller',
  request: { query: z.object({ trip_id: z.uuid().optional() }) },
  responses: {
    200: {
      description: 'The snapshot (schema-versioned; unknown fields are ignored by readers)',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    304: { description: 'Unchanged since the ETag sent in If-None-Match' },
    401: {
      description: 'AUTH_REQUIRED',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    403: {
      description: 'ACTION_KEY_SCOPE',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    404: { description: 'NOT_FOUND', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
});

/** A strong ETag over the snapshot's content (never its `generated_at`). */
export function widgetSnapshotEtag(snapshot: WidgetSnapshot): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(widgetSnapshotContent(snapshot)))
    .digest('base64url');
  return `"${digest.slice(0, 27)}"`;
}

export function registerWidgetSnapshotRoute(
  app: OpenAPIHono<AppEnv>,
  deps: WidgetSnapshotRouteDeps,
): void {
  app.openapi(
    route,
    async (c) => {
      let uid: string;
      let device: string;
      if (c.req.header('x-cp-key-id') !== undefined) {
        if (deps.keyring === undefined) throw new DomainError('ACTION_KEY_SCOPE');
        const key = await verifySignedRequest(c.req.raw, c.req.path, '', 'read_snapshot', {
          pool: deps.pool,
          keyring: deps.keyring,
        });
        uid = key.userId;
        device = key.deviceId;
      } else {
        uid = (await requireCommandSession(deps.sessions, c.req.raw.headers)).uid;
        device = c.req.header('x-cp-device') ?? '';
      }
      const { trip_id: tripId } = c.req.valid('query');
      const now = deps.now?.() ?? new Date();
      const snapshot = await withUser(deps.pool, uid, device, (tx) =>
        loadWidgetSnapshot(tx, uid, tripId, now),
      );
      const etag = widgetSnapshotEtag(snapshot);
      c.header('ETag', etag);
      c.header('Cache-Control', 'private, no-cache');
      if (c.req.header('if-none-match') === etag) return c.body(null, 304);
      return c.json(snapshot, 200);
    },
    validationHook,
  );
}
