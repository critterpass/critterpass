/**
 * The perk catalogue for the website (docs/api-contracts.md §5.6): `GET /v1/catalog/perks`, public
 * and 60/min/IP. The web Worker reads it server-side for the pricing section, which lists a perk
 * only while it is switched on here, as the app does from its synced rows. Read as `public_reader`
 * through `public.perks_public`: catalogue data, no prices and nothing about any user.
 */
import { publicPerksSchema, type PublicPerks } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { ErrorBodySchema, validationHook } from '../commands/_framework/doors';
import { enforce, PREVIEW_PER_IP_RULE, visitorOf } from './links';
import type { PublicPreviewRouteDeps } from './public-previews';
import { asPublicReader } from './public-reader';

/** The switched-on perks, in display order. */
export async function readPublicPerks(pool: pg.Pool): Promise<PublicPerks> {
  const perks = await asPublicReader(pool, {}, async (tx) => {
    const { rows } = await tx.query<Record<string, unknown>>(
      'SELECT key, tier, copy_key, sort FROM public.perks_public ORDER BY sort, key',
    );
    return rows;
  });
  return publicPerksSchema.parse({ perks });
}

const route = createRoute({
  method: 'get',
  path: '/v1/catalog/perks',
  tags: ['catalog'],
  summary: 'The switched-on perk lines, for the website',
  request: { query: z.object({}) },
  responses: {
    200: {
      description: 'Perks',
      content: { 'application/json': { schema: publicPerksSchema } },
    },
    429: {
      description: 'RATE_LIMITED',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export function registerPublicCatalogRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: PublicPreviewRouteDeps,
): void {
  app.openapi(
    route,
    async (c) => {
      const visitor = visitorOf(c, deps);
      await enforce(deps.redis, `rl:public:catalog:ip:${visitor.ip}`, PREVIEW_PER_IP_RULE);
      // The same for everyone and changed only from the console, so it may be kept for a while.
      c.header('cache-control', 'public, max-age=300');
      return c.json(await readPublicPerks(deps.pool), 200);
    },
    validationHook,
  );
}
