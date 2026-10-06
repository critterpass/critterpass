/**
 * The idea board's per-traveller reads (docs/api-contracts.md §5.5). `GET /v1/ideas/crewmates`:
 * which of the caller's crewmates (people sharing an active crew) voted for which idea, as user
 * ids the phone already holds names and faces for; nobody outside the caller's crews is ever
 * named. `POST /v1/ideas/similar`: the public ideas a new suggestion sounds like, so a duplicate
 * gets a vote instead of a second row. Matching is trigram similarity on the title, accents and
 * case folded, until an embedding vendor adds meaning.
 */
import { withUser } from '@cp/db';
import { DomainError, VOTABLE_IDEA_STATUSES } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { asServer } from '../billing/as-server';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';

export interface IdeaRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
}

export interface CrewmateVote {
  readonly idea_id: string;
  readonly user_id: string;
}

export interface SimilarIdea {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly votes_count: number;
}

/** Lowest title similarity that counts as "sounds like this one". */
export const SIMILAR_IDEA_THRESHOLD = 0.4;
const SIMILAR_LIMIT = 3;
const SIMILAR_PER_UID_RULE = { windowSeconds: 60, max: 120 };

const similarSchema = z.object({
  text: z.string().trim().min(3).max(120),
  locale: z.string().min(2).max(35).optional(),
});

/** Crewmates' votes on public ideas; the caller's own votes are on the phone already. */
export async function crewmateVotes(
  tx: pg.PoolClient,
  uid: string,
): Promise<readonly CrewmateVote[]> {
  return asServer(tx, async () => {
    const { rows } = await tx.query<CrewmateVote>(
      `SELECT DISTINCT v.idea_id, v.user_id
         FROM idea_votes v
         JOIN ideas i ON i.id = v.idea_id AND i.status <> 'pending_review'
        WHERE v.user_id <> $1
          AND v.user_id IN (
            SELECT them.user_id FROM crew_members them
              JOIN crew_members me ON me.crew_id = them.crew_id
             WHERE me.user_id = $1 AND me.status = 'active' AND them.status = 'active')
        ORDER BY v.idea_id, v.user_id`,
      [uid],
    );
    return rows;
  });
}

/** Up to three public ideas still taking votes whose titles sound like `text`, closest first. */
export async function similarIdeas(
  tx: pg.PoolClient,
  text: string,
): Promise<readonly SimilarIdea[]> {
  const { rows } = await tx.query<SimilarIdea>(
    `WITH q AS (SELECT app.unaccent_immutable(lower($1)) AS t)
     SELECT id, title, status, votes_count FROM (
       SELECT i.id, i.title, i.status, i.votes_count,
              greatest(word_similarity(q.t, app.unaccent_immutable(lower(i.title))),
                       word_similarity(app.unaccent_immutable(lower(i.title)), q.t)) AS score
         FROM ideas i CROSS JOIN q
        WHERE i.status = ANY($2::text[])) scored
      WHERE score >= $3
      ORDER BY score DESC, votes_count DESC, id
      LIMIT $4`,
    [text, [...VOTABLE_IDEA_STATUSES], SIMILAR_IDEA_THRESHOLD, SIMILAR_LIMIT],
  );
  return rows;
}

export function registerIdeaRoutes(app: OpenAPIHono<AppEnv>, deps: IdeaRouteDeps): void {
  app.get('/v1/ideas/crewmates', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const votes = await withUser(deps.pool, uid, 'unknown', (tx) => crewmateVotes(tx, uid));
    c.header('Cache-Control', 'private, max-age=60');
    return c.json({ votes });
  });

  app.post('/v1/ideas/similar', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'ideas_similar', uid, SIMILAR_PER_UID_RULE);
    const parsed = similarSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'ideas_similar' });
    const ideas = await withUser(deps.pool, uid, 'unknown', (tx) =>
      similarIdeas(tx, parsed.data.text),
    );
    return c.json({ ideas });
  });
}
