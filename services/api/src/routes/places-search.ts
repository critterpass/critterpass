/**
 * `GET /v1/places?q=` (doc delta to docs/api-contracts.md §5.5): place search for 3b-7, over every
 * destination of the place index (the guide destinations and each city of the 61 places) and the
 * places' country names, accent- and typo-tolerant (unaccent + pg_trgm: "marakech" finds
 * Marrakech). Rows carry the locals to find as silhouette ids only; a local's name never leaves the
 * server before its finder has found it. Guest rows are covered by the guest guide; live rows open
 * the guide's destination page.
 */
import { withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';

export interface PlaceSearchDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  /** Per-user request budget; defaults to 120 a minute. */
  readonly rateLimit?: { readonly windowSeconds: number; readonly max: number };
}

export interface PlaceSearchRow {
  readonly place_id: string;
  readonly name: string;
  /** The place (country) it belongs to, for the section header. */
  readonly country: string | null;
  readonly country_code: string | null;
  readonly coverage: 'live' | 'guest';
  /** The live guide's persona, or `tokek` covering as the guest guide. */
  readonly guide: string;
  /** Silhouette ids of the locals to find here (critter keys; never names). */
  readonly locals: readonly string[];
}

const querySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

/** Typing sends a request per keystroke; this only stops a runaway client. */
const SEARCHES_PER_UID_RULE = { windowSeconds: 60, max: 120 };
/** Below this similarity a row is not a match (prefix matches always are). */
const MIN_SCORE = 0.3;

interface Row {
  id: string;
  name: string;
  country: string | null;
  code: string | null;
  coverage: 'live' | 'guest';
  guide: string | null;
  set_id: string | null;
}

export async function searchDestinations(
  tx: pg.PoolClient,
  q: string,
  limit: number,
): Promise<PlaceSearchRow[]> {
  const { rows } = await tx.query<Row>(
    `WITH q AS (SELECT app.unaccent_immutable(lower($1)) AS t),
     scored AS (
       SELECT d.id, d.name, coalesce(s.name, d.country) AS country, upper(s.code) AS code,
              d.coverage, s.guide_slug AS guide, s.id AS set_id,
              greatest(
                similarity(app.unaccent_immutable(lower(d.name)), q.t),
                word_similarity(q.t, app.unaccent_immutable(lower(d.name))),
                0.9 * coalesce(similarity(app.unaccent_immutable(lower(s.name)), q.t), 0),
                CASE WHEN app.unaccent_immutable(lower(d.name)) LIKE q.t || '%' THEN 1.0 ELSE 0 END,
                CASE WHEN app.unaccent_immutable(lower(coalesce(s.name, d.country, ''))) LIKE q.t || '%'
                     THEN 0.95 ELSE 0 END
              ) AS score
         FROM destinations d
         LEFT JOIN critter_sets s ON s.id = d.critter_set_id
         CROSS JOIN q
        WHERE d.critter_set_id IS NULL OR s.id IS NOT NULL)
     SELECT id, name, country, code, coverage, guide, set_id FROM scored
      WHERE score >= $2
      ORDER BY score DESC, (coverage = 'live') DESC, name
      LIMIT $3`,
    [q, MIN_SCORE, limit],
  );
  const setIds = [...new Set(rows.flatMap((row) => (row.set_id === null ? [] : [row.set_id])))];
  const locals = await tx.query<{ key: string; set_id: string; city: string }>(
    'SELECT key, set_id, city FROM critters WHERE set_id = ANY ($1::uuid[]) ORDER BY no',
    [setIds],
  );
  const plain = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  return rows.map((row) => {
    const inPlace = locals.rows.filter((local) => local.set_id === row.set_id);
    const inCity = inPlace.filter((local) => plain(local.city) === plain(row.name));
    return {
      place_id: row.id,
      name: row.name,
      country: row.country,
      country_code: row.code,
      coverage: row.coverage,
      guide: row.coverage === 'live' ? (row.guide ?? 'tokek') : 'tokek',
      locals: (inCity.length > 0 ? inCity : inPlace.slice(0, 3)).map((local) => local.key),
    };
  });
}

export function registerPlaceSearchRoutes(app: OpenAPIHono<AppEnv>, deps: PlaceSearchDeps): void {
  app.get('/v1/places', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(
      deps.redis,
      'place_search',
      uid,
      deps.rateLimit ?? SEARCHES_PER_UID_RULE,
    );
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'q_required' });
    const results = await withUser(deps.pool, uid, 'unknown', (tx) =>
      searchDestinations(tx, parsed.data.q, parsed.data.limit),
    );
    c.header('Cache-Control', 'private, max-age=60');
    return c.json({ results });
  });
}
