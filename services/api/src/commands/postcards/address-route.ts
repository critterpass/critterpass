/**
 * `GET /v1/me/mailing-address`: whether the caller has saved an address for printed postcards, and
 * its country (so the app can say when the printer cannot reach it). Never the address itself: it
 * is sealed and only the print job opens it.
 */
import { withSystem } from '@cp/db';
import type { MailingAddressPresence } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';
import { requireCommandSession, type SessionResolver } from '../_framework/session';

export function registerMailingAddressRoute(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly pool: pg.Pool; readonly sessions: SessionResolver },
): void {
  app.get('/v1/me/mailing-address', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const country = await withSystem(deps.pool, async (tx) => {
      const { rows } = await tx.query<{ country: string }>(
        'SELECT country FROM mailing_addresses WHERE user_id = $1',
        [session.uid],
      );
      return rows[0]?.country ?? null;
    });
    const body: MailingAddressPresence = { saved: country !== null, country };
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
