/**
 * `season.research` (docs/api-contracts-async.md §2.3; docs/product-decisions.md D23): once a month,
 * for each live destination, code builds web searches from the destination, the month three months
 * ahead and fixed event keywords (no user data), runs them through the gateway's `web_search` tool,
 * and the `season.research` route extracts dated candidates, each citing one of the searched pages.
 * Candidates join the season review queue as `season_events` rows with `reviewed_at` null, skipping
 * any that duplicate an existing event; nothing reads them until a content reviewer approves one.
 */
import {
  createWebSearchExecutor,
  parseStructuredText,
  textOf,
  UNTRUSTED_CONTEXT,
  userTurnWithData,
  wrapAllUntrusted,
  type Gateway,
  type SearchProvider,
  type WebSearchOutput,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  isSameSeasonEvent,
  monthName,
  overlapsMonth,
  SEASON_EVENT_KINDS,
  seasonResearchEventSchema,
  seasonResearchKey,
  seasonResearchMonth,
  seasonResearchQueries,
  seasonResearchReplySchema,
  TRAVEL_DESTINATIONS,
  type SeasonResearchCandidate,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../boss/define-job';

/** The job has no user: searches run under the nil uid, and no crew terms exist to screen. */
const SYSTEM_UID = '00000000-0000-0000-0000-000000000000';

export interface SeasonResearchDeps {
  readonly gateway: Gateway;
  readonly search: SearchProvider;
  readonly now?: () => Date;
}

const REPLY_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'kind', 'starts_on', 'ends_on', 'source_url'],
          properties: {
            name: { type: 'string' },
            kind: { type: 'string', enum: [...SEASON_EVENT_KINDS] },
            starts_on: { type: 'string', description: 'YYYY-MM-DD' },
            ends_on: { type: 'string', description: 'YYYY-MM-DD' },
            source_url: { type: 'string', description: 'The web result URL stating these dates' },
          },
        },
      },
    },
  },
};

function instructions(place: string, month: string): string {
  const label = `${monthName(month)} ${month.slice(0, 4)}`;
  return [
    `You help a travel editor list dated events in ${place} during ${label}.`,
    `From the web results only, list festivals, ceremonies, public holidays, closures and nature seasons (blossom, foliage) that take place at least partly in ${label}.`,
    `Include an event only when a result states its dates for ${month.slice(0, 4)}; never guess or carry dates over from another year. Use the exact result URL that states the dates as source_url.`,
    'Kinds: festival, ceremony, holiday, closure, blossom, foliage. Name each event as locals and visitors know it. Reply with an empty list when no result gives dates.',
    UNTRUSTED_CONTEXT,
  ].join('\n');
}

/** Searches the destination-month topics and returns the surviving results, deduplicated by URL. */
async function searchTopics(
  deps: SeasonResearchDeps,
  queries: readonly string[],
  signal: AbortSignal | undefined,
): Promise<WebSearchOutput['results']> {
  const execute = createWebSearchExecutor(deps.search, deps.now ? { now: deps.now } : {});
  const byUrl = new Map<string, WebSearchOutput['results'][number]>();
  for (const query of queries) {
    const context = {
      uid: SYSTEM_UID,
      tripId: null,
      caller: 'R' as const,
      route: 'season.research' as const,
      ...(signal ? { signal } : {}),
    };
    const { results } = await execute({ query }, context);
    for (const result of results) if (!byUrl.has(result.url)) byUrl.set(result.url, { ...result });
  }
  return [...byUrl.values()];
}

/** Web search and extraction for one destination and month: cited candidates, not yet deduplicated. */
export async function researchSeasonEvents(
  deps: SeasonResearchDeps,
  target: { readonly place: string; readonly month: string },
  signal?: AbortSignal,
): Promise<SeasonResearchCandidate[]> {
  const results = await searchTopics(deps, seasonResearchQueries(target), signal);
  if (results.length === 0) return [];
  const blocks = wrapAllUntrusted(
    results.map((result) => ({
      kind: 'web_result' as const,
      text: result.snippet,
      source: result.url,
      label: result.title,
      at: result.published_at ?? `fetched ${result.fetched_at}`,
    })),
  );
  const reply = await deps.gateway.callModel('season.research', {
    system: instructions(target.place, target.month),
    messages: [userTurnWithData(`List the dated events in ${target.place}.`, blocks)],
    outputFormat: REPLY_FORMAT,
    ...(signal ? { signal } : {}),
  });
  const parsed = seasonResearchReplySchema.safeParse(parseStructuredText(textOf(reply.message)));
  if (!parsed.success) return [];
  const fetchedAt = new Map(results.map((result) => [result.url, result.fetched_at]));
  const candidates: SeasonResearchCandidate[] = [];
  for (const raw of parsed.data.events) {
    const event = seasonResearchEventSchema.safeParse(raw);
    if (!event.success || !overlapsMonth(event.data, target.month)) continue;
    // A candidate must cite a page the search returned: an invented or supplier URL is dropped.
    const fetched = fetchedAt.get(event.data.source_url);
    if (fetched === undefined) continue;
    candidates.push({ ...event.data, fetched_at: fetched });
  }
  return candidates;
}

/** Queues the candidates that duplicate no existing event (or each other); returns the count. */
export async function queueSeasonCandidates(
  tx: pg.PoolClient,
  destinationId: string,
  candidates: readonly SeasonResearchCandidate[],
): Promise<number> {
  const { rows: existing } = await tx.query<{ name: string; starts_on: string; ends_on: string }>(
    `SELECT name, starts_on::text, ends_on::text FROM season_events WHERE destination_id = $1`,
    [destinationId],
  );
  const known = [...existing];
  let queued = 0;
  for (const candidate of candidates) {
    if (known.some((event) => isSameSeasonEvent(event, candidate))) continue;
    known.push(candidate);
    const result = await tx.query(
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, confidence,
         source, source_url, sourced_on, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ($10::timestamptz AT TIME ZONE 'UTC')::date, NULL)
       ON CONFLICT (destination_id, key) DO NOTHING`,
      [
        destinationId,
        seasonResearchKey(candidate),
        candidate.kind,
        candidate.name,
        candidate.starts_on,
        candidate.ends_on,
        candidate.kind === 'blossom' || candidate.kind === 'foliage' ? 'forecast' : 'confirmed',
        `web: ${new URL(candidate.source_url).hostname.replace(/^www\./u, '')}`,
        candidate.source_url,
        candidate.fetched_at,
      ],
    );
    queued += result.rowCount ?? 0;
  }
  return queued;
}

export interface SeasonResearchReport {
  readonly month: string;
  readonly destinations: number;
  readonly candidates: number;
  readonly queued: number;
}

const payloadSchema = z
  .object({
    /** One destination slug; unset = every live destination. */
    destination: z.string().optional(),
    /** `YYYY-MM`; unset = three months ahead. */
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
      .optional(),
  })
  .nullish();

/** One research run: every live destination (or the one named) for one month. */
export async function runSeasonResearch(
  pool: pg.Pool,
  deps: SeasonResearchDeps,
  options: {
    readonly destination?: string;
    readonly month?: string;
    readonly signal?: AbortSignal;
  },
  logger: JobLogger,
): Promise<SeasonResearchReport> {
  const month = options.month ?? seasonResearchMonth((deps.now ?? (() => new Date()))());
  const slugs =
    options.destination === undefined ? Object.keys(TRAVEL_DESTINATIONS) : [options.destination];
  const { rows: destinations } = await withSystem(pool, (tx) =>
    tx.query<{ id: string; slug: string; name: string; country: string | null }>(
      'SELECT id, slug, name, country FROM destinations WHERE slug = ANY ($1) ORDER BY slug',
      [slugs],
    ),
  );
  let candidates = 0;
  let queued = 0;
  for (const destination of destinations) {
    const place = [destination.name, destination.country].filter(Boolean).join(', ');
    try {
      const found = await researchSeasonEvents(deps, { place, month }, options.signal);
      candidates += found.length;
      queued += await withSystem(pool, (tx) => queueSeasonCandidates(tx, destination.id, found));
    } catch (error) {
      // One destination's search or model failure leaves the others to finish.
      logger.warn({ err: error, destination: destination.slug, month }, 'season research failed');
    }
  }
  return { month, destinations: destinations.length, candidates, queued };
}

export function seasonResearchJob(deps: SeasonResearchDeps): AnyJobDefinition {
  return defineJob({
    queue: 'season.research',
    schema: payloadSchema,
    async handler(data, { pool, logger, job }) {
      const report = await runSeasonResearch(
        pool,
        deps,
        {
          ...(data?.destination === undefined ? {} : { destination: data.destination }),
          ...(data?.month === undefined ? {} : { month: data.month }),
          signal: job.signal,
        },
        logger,
      );
      logger.info({ ...report }, 'season research queued candidates for review');
      return { ...report };
    },
  });
}
