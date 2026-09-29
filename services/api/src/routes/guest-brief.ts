/**
 * `POST /v1/places/{id}/guest-brief` (doc delta to docs/api-contracts.md §5.3): the guest guide's
 * page for a place no live guide covers (3b-8), as a stream:
 *
 * - `place`: what code knows at once: the chips (best months from the place's month hints, the
 *   exchange rate into the caller's home currency, stops on the fewest-stop fare from their home
 *   airport when there is fare data) and the locals to find as silhouettes with their hints.
 * - `fact` ×3–5: WHAT TOKEK KNOWS SO FAR, written by the guest guide (route `guest.guide`) from
 *   pages our code searched on the allow-listed domains only; each fact keeps its page's URL and
 *   domain, and a number only if that page has it.
 * - `done{cached, ai_generated, hidden, sources}`.
 *
 * Facts are cached per place and crew-size bucket for a week. The `vote.guest_brief.enabled` kill
 * switch (or no model or search provider) hides the facts; the rest of the page still works.
 */
import {
  createGateway,
  crewSizeBucket,
  recordUsage,
  searchProviderFromEnv,
  searchGuestSources,
  streamGuestBrief,
  type GuestFact,
  type Gateway,
  type SearchProvider,
} from '@cp/ai';
import { withSystem, withUser } from '@cp/db';
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
import { createKillSwitches } from '../ops/kill-switches';
import { SSE_RESPONSE_HEADERS, sseBody, type SseFrame } from './sse';

export const GUEST_BRIEF_SWITCH = 'vote.guest_brief.enabled';
export const GUEST_BRIEF_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface GuestBriefCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export interface GuestBriefDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly cache: GuestBriefCache;
  readonly gateway: Pick<Gateway, 'streamModel'> | undefined;
  readonly search: SearchProvider | undefined;
  readonly isOn: (key: string) => Promise<boolean>;
}

const bodySchema = z.object({ crew_id: z.uuid().optional() }).strict();
const BRIEFS_PER_UID_RULE = { windowSeconds: 60, max: 20 };

interface PlaceRow {
  id: string;
  name: string;
  country: string | null;
  currency: string | null;
  set_id: string | null;
  month_hints: { crowd: number }[] | null;
}

export type GuestPlaceFrame = {
  readonly type: 'place';
  readonly place_id: string;
  readonly name: string;
  readonly country: string | null;
  readonly currency: string | null;
  readonly best_months: readonly number[];
  readonly fx: { base: string; quote: string; rate: number; as_of: string } | null;
  readonly stops: number | null;
  readonly locals: readonly { id: string; hint: string }[];
};

async function placeFrame(
  tx: pg.PoolClient,
  placeId: string,
  uid: string,
): Promise<GuestPlaceFrame> {
  const { rows } = await tx.query<PlaceRow>(
    `SELECT d.id, d.name, coalesce(s.name, d.country) AS country, coalesce(d.currency, s.currency) AS currency,
            s.id AS set_id, s.month_hints
       FROM destinations d LEFT JOIN critter_sets s ON s.id = d.critter_set_id
      WHERE d.id = $1`,
    [placeId],
  );
  const place = rows[0];
  if (place === undefined) throw new DomainError('NOT_FOUND', { reason: 'place' });
  const { rows: me } = await tx.query<{
    home_currency: string | null;
    home_airport: string | null;
  }>('SELECT home_currency, home_airport FROM users WHERE id = $1', [uid]);
  const home = me[0];
  const fx =
    place.currency === null || home?.home_currency == null || home.home_currency === place.currency
      ? undefined
      : (
          await tx.query<{ base: string; quote: string; rate: string; as_of: string }>(
            `SELECT base, quote, rate::text, as_of::text FROM fx_snapshots
              WHERE base = $1 AND quote = $2 ORDER BY as_of DESC LIMIT 1`,
            [place.currency, home.home_currency],
          )
        ).rows[0];
  const stops =
    home?.home_airport == null
      ? undefined
      : (
          await tx.query<{ stops: number | null }>(
            `SELECT min(transfers)::int AS stops FROM fare_cells
              WHERE destination_id = $1 AND origin_iata = $2 AND transfers IS NOT NULL`,
            [placeId, home.home_airport],
          )
        ).rows[0]?.stops;
  const locals =
    place.set_id === null
      ? []
      : (
          await tx.query<{ key: string; note: string }>(
            'SELECT key, note FROM critters WHERE set_id = $1 ORDER BY no LIMIT 6',
            [place.set_id],
          )
        ).rows;
  const bestMonths = (place.month_hints ?? [])
    .map((hint, i) => ({ month: i + 1, crowd: hint.crowd }))
    .sort((a, b) => a.crowd - b.crowd || a.month - b.month)
    .slice(0, 2)
    .map((hint) => hint.month)
    .sort((a, b) => a - b);
  return {
    type: 'place',
    place_id: place.id,
    name: place.name,
    country: place.country,
    currency: place.currency,
    best_months: bestMonths,
    fx: fx === undefined ? null : { ...fx, rate: Number(fx.rate) },
    stops: stops ?? null,
    locals: locals.map((local) => ({ id: local.key, hint: local.note })),
  };
}

interface CachedBrief {
  readonly facts: readonly GuestFact[];
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DomainError('VALIDATION', { reason: 'invalid_json' });
  }
}

export function registerGuestBriefRoutes(app: OpenAPIHono<AppEnv>, deps: GuestBriefDeps): void {
  app.post('/v1/places/:id/guest-brief', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'guest_brief', uid, BRIEFS_PER_UID_RULE);
    const placeId = z.uuid().safeParse(c.req.param('id'));
    const body = bodySchema.safeParse(await readJson(c.req.raw));
    if (!placeId.success || !body.success) throw new DomainError('VALIDATION');
    const crewId = body.data.crew_id;
    const crewSize = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      if (crewId === undefined) return 1;
      const { rows } = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM crew_members WHERE crew_id = $1 AND status = 'active'`,
        [crewId],
      );
      const n = rows[0]?.n ?? 0;
      if (n === 0) throw new DomainError('NOT_FOUND', { reason: 'crew' });
      return n;
    });
    const place = await withSystem(deps.pool, (tx) => placeFrame(tx, placeId.data, uid));
    const key = `gb:v1:${place.place_id}:${crewSizeBucket(crewSize)}`;
    const enabled = await deps.isOn(GUEST_BRIEF_SWITCH);

    async function* frames(signal: AbortSignal): AsyncGenerator<SseFrame> {
      yield place;
      if (!enabled || deps.gateway === undefined || deps.search === undefined) {
        yield { type: 'done', cached: false, ai_generated: false, hidden: true, sources: [] };
        return;
      }
      const hit = await deps.cache.get(key);
      if (hit !== null) {
        const cached = JSON.parse(hit) as CachedBrief;
        for (const fact of cached.facts) yield { type: 'fact', ...fact };
        yield {
          type: 'done',
          cached: true,
          ai_generated: true,
          hidden: false,
          sources: sourcesOf(cached.facts),
        };
        return;
      }
      const facts: GuestFact[] = [];
      try {
        const sources = await searchGuestSources(deps.search, place, signal);
        for await (const fact of streamGuestBrief(
          deps.gateway,
          place,
          crewSize,
          sources,
          { userId: uid },
          signal,
        )) {
          facts.push(fact);
          yield { type: 'fact', ...fact };
        }
      } catch {
        if (signal.aborted) return;
        yield { type: 'error', code: 'AI_UNAVAILABLE', retryable: true };
        return;
      }
      if (facts.length > 0) {
        await deps.cache.set(key, JSON.stringify({ facts } satisfies CachedBrief), {
          EX: GUEST_BRIEF_TTL_SECONDS,
        });
      }
      yield {
        type: 'done',
        cached: false,
        ai_generated: facts.length > 0,
        hidden: facts.length === 0,
        sources: sourcesOf(facts),
      };
    }

    return new Response(sseBody(frames), { status: 200, headers: SSE_RESPONSE_HEADERS });
  });
}

function sourcesOf(facts: readonly GuestFact[]): { url: string; domain: string }[] {
  const seen = new Map<string, string>();
  for (const fact of facts) seen.set(fact.url, fact.domain);
  return [...seen].map(([url, domain]) => ({ url, domain }));
}

/** Boot wiring: the model and the search provider run only with their keys configured. */
export function registerGuestBriefRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<GuestBriefDeps, 'gateway' | 'search' | 'isOn'>,
  env: {
    readonly ANTHROPIC_API_KEY?: string | undefined;
    readonly ANTHROPIC_BASE_URL?: string | undefined;
  },
): void {
  const switches = createKillSwitches(deps.pool);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          assertRouteOn: switches.assertAiRoute,
          onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
        });
  registerGuestBriefRoutes(app, {
    ...deps,
    gateway,
    search: searchProviderFromEnv(),
    isOn: (key) => switches.isOn(key),
  });
}
