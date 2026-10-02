/**
 * `GET /v1/help/articles?q&locale&context` (docs/api-contracts.md §5.5): help centre search over
 * the published articles. Ranking is full text (title, then summary, then body, every word as a
 * prefix so "refund" finds "refunds") plus trigram similarity on the title for typos ("refnd"),
 * with articles of the categories the traveller came from lifted a little. When an embedding
 * vendor is configured the query's embedding adds a meaning score; until then the vector branch is
 * off and ranking stands on text and trigram alone. A locale with no articles falls back to
 * English and says so. Without `q` it lists the context's articles for the hub.
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

/** Turns a search into one embedding; none is configured until an embedding vendor is chosen. */
export interface QueryEmbedder {
  embed(texts: readonly string[]): Promise<ReadonlyArray<readonly number[]>>;
}

export interface HelpArticleDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly embedder?: QueryEmbedder | undefined;
}

export interface HelpArticleHit {
  readonly slug: string;
  readonly locale: string;
  readonly category: string;
  readonly title: string;
  readonly summary: string;
}

export interface HelpSearchResult {
  readonly articles: readonly HelpArticleHit[];
  /** The locale the articles are in: the one asked for, or English when it has none. */
  readonly locale: string;
  readonly fallback: boolean;
}

/** Where the traveller opened help from, and the categories that answer it first. */
export const HELP_CONTEXT_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  settings: ['passes_and_boosts', 'critters'],
  money: ['splitting_money', 'refunds', 'passes_and_boosts'],
  plan: ['trips_and_crews', 'getting_started', 'offline_and_maps'],
  trip: ['offline_and_maps', 'safety', 'bookings'],
  bookings: ['bookings', 'refunds'],
  critters: ['critters'],
  crew: ['trips_and_crews'],
  account: ['privacy_and_account', 'passes_and_boosts'],
  safety: ['safety', 'insurance'],
};

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/u)
    .default('en'),
  context: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const SEARCHES_PER_UID_RULE = { windowSeconds: 60, max: 120 };
const CONTEXT_BOOST = 0.15;
const MIN_TITLE_SIMILARITY = 0.3;

/** The query's words as prefix terms for `to_tsquery('simple', …)`, or null when it has none. */
export function prefixTsQuery(q: string): string | null {
  const words =
    q
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const unique = [...new Set(words)].slice(0, 8);
  return unique.length === 0 ? null : unique.map((w) => `${w}:*`).join(' & ');
}

async function hasArticles(tx: pg.PoolClient, locale: string): Promise<boolean> {
  const { rows } = await tx.query('SELECT 1 FROM help_articles WHERE locale = $1 LIMIT 1', [
    locale,
  ]);
  return rows.length > 0;
}

export async function searchHelpArticles(
  tx: pg.PoolClient,
  input: {
    readonly q: string | null;
    readonly locale: string;
    readonly context: string | null;
    readonly limit: number;
    readonly embedding?: readonly number[] | null;
  },
): Promise<HelpSearchResult> {
  const base = input.locale.split('-')[0] ?? 'en';
  const locale = (await hasArticles(tx, input.locale))
    ? input.locale
    : base !== input.locale && (await hasArticles(tx, base))
      ? base
      : 'en';
  const boosted = HELP_CONTEXT_CATEGORIES[input.context ?? ''] ?? [];
  const tsq = input.q === null ? null : prefixTsQuery(input.q);
  const vector =
    input.embedding === undefined || input.embedding === null
      ? null
      : `[${input.embedding.join(',')}]`;
  if (input.q === null || tsq === null) {
    const { rows } = await tx.query<HelpArticleHit>(
      `SELECT slug, locale, category, title, summary FROM help_articles
        WHERE locale = $1
        ORDER BY coalesce(array_position($2::text[], category), 1000), title
        LIMIT $3`,
      [locale, boosted, input.limit],
    );
    return { articles: rows, locale, fallback: locale !== input.locale };
  }
  const { rows } = await tx.query<HelpArticleHit>(
    `WITH q AS (
       SELECT to_tsquery('simple', $2) AS tsq, app.unaccent_immutable(lower($3)) AS t
     ),
     scored AS (
       SELECT a.slug, a.locale, a.category, a.title, a.summary,
              CASE WHEN a.fts @@ q.tsq THEN ts_rank_cd('{0.1, 0.2, 0.6, 1.0}', a.fts, q.tsq, 1)
                   ELSE 0 END AS text_rank,
              word_similarity(q.t, app.unaccent_immutable(lower(a.title))) AS title_sim,
              CASE WHEN $5::vector IS NULL OR a.embedding IS NULL THEN 0
                   ELSE 1 - (a.embedding <=> $5::vector) END AS meaning,
              CASE WHEN a.category = ANY($4::text[]) THEN ${CONTEXT_BOOST} ELSE 0 END AS boost
         FROM help_articles a CROSS JOIN q
        WHERE a.locale = $1)
     SELECT slug, locale, category, title, summary FROM scored
      WHERE text_rank > 0 OR title_sim >= ${MIN_TITLE_SIMILARITY} OR meaning >= 0.5
      ORDER BY text_rank + 0.5 * title_sim + 0.5 * meaning + boost DESC, title
      LIMIT $6`,
    [locale, tsq, input.q, boosted, vector, input.limit],
  );
  return { articles: rows, locale, fallback: locale !== input.locale };
}

export function registerHelpArticleRoutes(app: OpenAPIHono<AppEnv>, deps: HelpArticleDeps): void {
  app.get('/v1/help/articles', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'help_search', uid, SEARCHES_PER_UID_RULE);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'help_query' });
    const { q, locale, context, limit } = parsed.data;
    const text = q === undefined || q === '' ? null : q;
    let embedding: readonly number[] | null = null;
    if (text !== null && deps.embedder !== undefined) {
      // A vendor outage leaves search on text and trigram, never failing it.
      embedding = (await deps.embedder.embed([text]).catch(() => []))[0] ?? null;
    }
    const result = await withUser(deps.pool, uid, 'unknown', (tx) =>
      searchHelpArticles(tx, { q: text, locale, context: context ?? null, limit, embedding }),
    );
    c.header('Cache-Control', 'private, max-age=60');
    return c.json(result);
  });
}
