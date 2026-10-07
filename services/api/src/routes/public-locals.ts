/**
 * A place's locals on the web (docs/api-contracts.md §5.6): `GET /v1/public/locals/{slug}`, public
 * and 60/min/IP. The web Worker calls it for `/locals/{slug}` and its share card. Read as
 * `public_reader` from `public.locals_place_public`, so the answer can carry only what that view
 * allows: the place, one credited photo, and per critter a rarity tier and a body shape. Never a
 * critter's name, art, description, where it turns up or who found it. An unknown place, a
 * day-trip area and a place with no live critters answer 404.
 */
import { DomainError, PUBLIC_LOCALS_MAX, publicLocalsSchema, type PublicLocals } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { ErrorBodySchema, validationHook } from '../commands/_framework/doors';
import { enforce, PREVIEW_PER_IP_RULE, visitorOf } from './links';
import type { PublicPreviewRouteDeps } from './public-previews';
import { asPublicReader } from './public-reader';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

interface PlaceRow {
  readonly slug: string;
  readonly name: string;
  readonly area: string;
  readonly photo: {
    readonly key: string;
    readonly width: number;
    readonly height: number;
    readonly credit: string;
    readonly source_url: string;
  } | null;
  readonly critters: readonly { readonly rarity: string; readonly silhouette: string }[];
}

/** The place's public page content, or null when there is nothing to show for the slug. */
export async function readPublicLocals(
  pool: pg.Pool,
  slug: string,
  mediaPublicBaseUrl: string | undefined,
): Promise<PublicLocals | null> {
  if (!SLUG.test(slug)) return null;
  const rows = await asPublicReader(pool, { place: slug }, async (tx) => {
    const { rows: places } = await tx.query<PlaceRow>(
      'SELECT slug, name, area, photo, critters FROM public.locals_place_public LIMIT 1',
    );
    return places;
  });
  const row = rows[0];
  if (row === undefined || row.critters.length === 0) return null;
  const base = mediaPublicBaseUrl?.replace(/\/+$/u, '');
  const photo =
    row.photo === null || base === undefined || base === ''
      ? null
      : {
          url: `${base}/${row.photo.key}`,
          width: row.photo.width,
          height: row.photo.height,
          credit: row.photo.credit,
          source_url: row.photo.source_url,
        };
  return publicLocalsSchema.parse({
    kind: 'locals',
    slug: row.slug,
    name: row.name,
    area: row.area,
    photo,
    count: row.critters.length,
    critters: row.critters.slice(0, PUBLIC_LOCALS_MAX),
  });
}

const route = createRoute({
  method: 'get',
  path: '/v1/public/locals/{slug}',
  tags: ['links'],
  summary: 'What anyone may know about the critters of a place',
  request: { params: z.object({ slug: z.string().min(1).max(64) }) },
  responses: {
    200: {
      description: 'The place and its locals as silhouettes',
      content: { 'application/json': { schema: publicLocalsSchema } },
    },
    404: {
      description: 'NOT_FOUND: unknown place, or a place with no critters to find',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    429: {
      description: 'RATE_LIMITED',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export function registerPublicLocalsRoute(
  app: OpenAPIHono<AppEnv>,
  deps: PublicPreviewRouteDeps,
): void {
  app.openapi(
    route,
    async (c) => {
      const visitor = visitorOf(c, deps);
      await enforce(deps.redis, `rl:public:preview:ip:${visitor.ip}`, PREVIEW_PER_IP_RULE);
      const { slug } = c.req.valid('param');
      const locals = await readPublicLocals(deps.pool, slug, deps.mediaPublicBaseUrl);
      if (locals === null) throw new DomainError('NOT_FOUND');
      // The same for every visitor and it changes only with a content release.
      c.header('cache-control', 'public, max-age=300');
      return c.json(locals, 200);
    },
    validationHook,
  );
}
