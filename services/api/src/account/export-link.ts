/**
 * `GET /v1/me/export/{id}` (docs/api-contracts.md §5.5): a short-lived signed link to the caller's
 * own ready export, served by the media Worker. Someone else's export reads as not found; one not
 * ready yet, or past its seven days, is a state the app shows instead.
 */
import { withSystem } from '@cp/db';
import { dataExportLinkSchema, DomainError, type DataExportLink } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import {
  ErrorBodySchema,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import {
  CMD_RESULTS_PER_UID_RULE,
  enforceUidRateLimit,
  requireCommandSession,
} from '../commands/_framework/session';
import { mintReadUrl, READ_URL_TTL_SECONDS, type MediaSigningConfig } from '../media/sign';

export interface ExportLinkDeps extends CommandDoorDeps {
  readonly signing: MediaSigningConfig;
  readonly now?: () => Date;
}

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const exportLinkRoute = createRoute({
  method: 'get',
  path: '/v1/me/export/{id}',
  tags: ['me'],
  summary: "A signed link to the caller's ready data export",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'The link, and when it and the export stop working',
      content: { 'application/json': { schema: dataExportLinkSchema } },
    },
    401: error('AUTH_REQUIRED'),
    404: error('NOT_FOUND'),
    409: error('STATE_INVALID'),
    429: error('RATE_LIMITED'),
  },
});

export function registerExportLinkRoute(app: OpenAPIHono<AppEnv>, deps: ExportLinkDeps): void {
  app.openapi(
    exportLinkRoute,
    async (c) => {
      const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
      await enforceUidRateLimit(deps.redis, 'me_export_link', uid, CMD_RESULTS_PER_UID_RULE);
      const id = c.req.valid('param').id;
      const row = await withSystem(deps.pool, async (tx) => {
        const { rows } = await tx.query<{
          status: string;
          r2_key: string | null;
          expires_at: Date | null;
          bytes: string | null;
        }>(
          'SELECT status, r2_key, expires_at, bytes FROM data_exports WHERE id = $1 AND user_id = $2',
          [id, uid],
        );
        return rows[0];
      });
      if (row === undefined) throw new DomainError('NOT_FOUND');
      const now = deps.now?.() ?? new Date();
      if (row.status !== 'ready' || row.r2_key === null || row.expires_at === null) {
        throw new DomainError('STATE_INVALID', { reason: `export_${row.status}` });
      }
      if (row.expires_at.getTime() <= now.getTime()) {
        throw new DomainError('STATE_INVALID', { reason: 'export_expired' });
      }
      const linkUntil = Math.min(
        now.getTime() + READ_URL_TTL_SECONDS * 1000,
        row.expires_at.getTime(),
      );
      const body: DataExportLink = {
        url: await mintReadUrl(deps.signing, row.r2_key, Math.floor(linkUntil / 1000)),
        link_expires_at: new Date(linkUntil).toISOString(),
        expires_at: row.expires_at.toISOString(),
        bytes: row.bytes === null ? null : Number(row.bytes),
      };
      return c.json(body, 200);
    },
    validationHook,
  );
}
