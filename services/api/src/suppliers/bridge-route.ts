/**
 * `GET /v1/suppliers/r/{sub_id}`: the attribution bridge behind `go.<domain>/out/{sub_id}`.
 * An offline tap opens the bridge at once with the app's own sub id; once the click has synced the
 * bridge redirects to the partner link built for it. Public (the partner's page is public too) and
 * never cached; an unknown sub id is `NOT_FOUND`, never an unattributed partner link.
 */
import { withSystem } from '@cp/db';
import { DomainError, SUB_ID_PATTERN } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';

export function registerSupplierBridgeRoute(app: OpenAPIHono<AppEnv>, pool: pg.Pool): void {
  app.get('/v1/suppliers/r/:subId', async (c) => {
    const subId = c.req.param('subId');
    if (!SUB_ID_PATTERN.test(subId)) throw new DomainError('NOT_FOUND', { reason: 'click' });
    const { rows } = await withSystem(pool, (tx) =>
      tx.query<{ url: string }>('SELECT url FROM affiliate_clicks WHERE sub_id = $1', [subId]),
    );
    const url = rows[0]?.url;
    if (url === undefined) throw new DomainError('NOT_FOUND', { reason: 'click' });
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    return c.redirect(url, 302);
  });
}
