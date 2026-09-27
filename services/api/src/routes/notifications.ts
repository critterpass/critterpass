/**
 * `GET /v1/notifications/{id}` (docs/api-contracts.md §5.5): the Notification Service Extension's
 * fetch of a notification sent in minimal-payload mode (`cp.full: false`). Authenticated by a
 * device action key with the `read_notification` scope; the row is read as app_user for the key's
 * uid, so the notifications owner policy is what keeps one user from reading another's.
 */
import { withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import { ErrorBodySchema, validationHook } from '../commands/_framework/doors';
import { verifySignedRequest, type ActionRouteDeps } from './actions';

const NotificationSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    category: z.string(),
    title: z.string(),
    body: z.string(),
    sender: z.unknown(),
    ctx: z.unknown(),
    items: z.unknown(),
    deep_link: z.string().nullable(),
    thread_id: z.string().nullable(),
    crew_id: z.string().nullable(),
    trip_id: z.string().nullable(),
    created_at: z.string(),
  })
  .openapi('NotificationContent');

const route = createRoute({
  method: 'get',
  path: '/v1/notifications/{id}',
  tags: ['notifications'],
  summary: 'Full content of one notification, for the notification service extension',
  request: {
    // Signed with X-CP-Key-Id / X-CP-Ts / X-CP-Sig over an empty body (see POST /v1/actions);
    // checked in the handler so a missing header is ACTION_KEY_SCOPE, not a schema error.
    params: z.object({ id: z.uuid() }),
  },
  responses: {
    200: {
      description: 'The notification as rendered for its recipient',
      content: { 'application/json': { schema: NotificationSchema } },
    },
    403: {
      description: 'ACTION_KEY_SCOPE',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    404: { description: 'NOT_FOUND', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
});

interface NotificationRow {
  id: string;
  key: string;
  category: string;
  title: string;
  body: string;
  sender: unknown;
  ctx: unknown;
  items: unknown;
  deep_link: string | null;
  thread_id: string | null;
  crew_id: string | null;
  trip_id: string | null;
  created_at: Date;
}

export function registerNotificationRoutes(app: OpenAPIHono<AppEnv>, deps: ActionRouteDeps): void {
  app.openapi(
    route,
    async (c) => {
      const key = await verifySignedRequest(c.req.raw, c.req.path, '', 'read_notification', deps);
      const { id } = c.req.valid('param');
      const { rows } = await withUser(deps.pool, key.userId, key.deviceId, (tx) =>
        tx.query<NotificationRow>(
          `SELECT id, key, category, title, body, sender, ctx, items, deep_link, thread_id, crew_id,
             trip_id, created_at
           FROM notifications WHERE id = $1`,
          [id],
        ),
      );
      const row = rows[0];
      if (row === undefined) throw new DomainError('NOT_FOUND', { resource: 'notification' });
      return c.json({ ...row, created_at: row.created_at.toISOString() }, 200);
    },
    validationHook,
  );
}
