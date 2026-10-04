/**
 * `POST /v1/trips/{id}/search/parse` (docs/api-contracts-planning.md, search): plain words into
 * chips, read against the caller's own plan. Participants only; anyone else is NOT_FOUND. The
 * model call counts against the silent `search_parse` fair-use cap (not the guide meter); past
 * the cap, with no model configured, with the route switched off or on any failed call, the answer
 * is a name search over the whole question with no chips, so search never waits on the model.
 */
import { fallbackSearchParse, parseSearch, type Gateway } from '@cp/ai';
import { withUser } from '@cp/db';
import type { SearchParseResult } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../../app';
import { validationHook } from '../../commands/_framework/doors';
import { requireCommandSession, type SessionResolver } from '../../commands/_framework/session';
import { searchDigest } from './digest';
import { bumpPlanningFairUse } from './fair-use';

export interface SearchParseRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  /** The api's gateway; undefined (no model key configured) = name search only. */
  readonly gateway: Pick<Gateway, 'callModel'> | undefined;
}

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.strictObject({ q: z.string().trim().min(1).max(300) });

async function readBody(request: Request): Promise<z.infer<typeof bodySchema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = undefined;
  }
  const parsed = bodySchema.safeParse(raw);
  validationHook(parsed);
  return parsed.data as z.infer<typeof bodySchema>;
}

export function registerSearchParseRoute(
  app: OpenAPIHono<AppEnv>,
  deps: SearchParseRouteDeps,
): void {
  app.post('/v1/trips/:id/search/parse', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id } = paramsSchema.parse(c.req.param());
    const { q } = await readBody(c.req.raw);
    const { digest, crewId, allowed } = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const read = await searchDigest(tx, id);
      const within =
        deps.gateway === undefined
          ? false
          : await bumpPlanningFairUse(tx, uid, 'search_parse', new Date());
      return { ...read, allowed: within };
    });
    let result: SearchParseResult = fallbackSearchParse(q);
    if (deps.gateway !== undefined && allowed) {
      const outcome = await parseSearch(
        deps.gateway,
        { question: q, digest },
        { usage: { userId: uid, crewId, tripId: id } },
      );
      result = outcome.result;
    }
    c.header('Cache-Control', 'private, no-store');
    return c.json(result);
  });
}
