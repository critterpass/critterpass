/**
 * Getting to a destination from a home city (`places.home_link`): on demand, the first time a
 * reader asks for the pair. The home is the city of an airport or metro code, a place and never a
 * person; the searches carry the two place names only (D23). One structured write names the real
 * ways to make the journey (flight, train, bus, car, boat) with how long each takes and what it
 * costs, every figure with a quote from a cited page (cite-or-drop, D30). Stored once per pair in
 * `destination_home_links` for every traveller from that city. A pair still fresh (unless forced)
 * or a spent daily cap, shared with the briefs, ends the run before any call.
 */
import {
  buildHomeLinkRequest,
  checkHomeLinkReply,
  DESTINATION_BRIEF_ROUTE,
  isDeclined,
  MODEL_IDS,
  parseStructuredText,
  textOf,
  type HomeWay,
} from '@cp/ai';
import { airportDataset } from '@cp/content/airports';
import { withSystem } from '@cp/db';
import { homeBaseFor, isVietnam, profileSourceLocales } from '@cp/domain';
import type pg from 'pg';

import { briefDestination, gatherPages, homeLinkQueries } from './brief-evidence';
import { costMinor } from './brief-links-store';
import type { DestinationBriefDeps } from './brief-run';
import { briefSpentTodayMicros } from './brief-store';

/** Fares move: a pair is written again after this; one that found nothing, sooner. */
export const HOME_LINK_TTL_DAYS = 30;
export const HOME_LINK_RETRY_DAYS = 7;

export interface HomeLinkInput {
  readonly destinationId: string;
  /** IATA code of the home airport or metro group. */
  readonly origin: string;
  readonly force?: boolean;
  readonly signal?: AbortSignal;
  readonly jobId?: string;
}

export type HomeLinkReport =
  | { readonly outcome: 'skipped'; readonly reason: string }
  | { readonly outcome: 'declined'; readonly reason: string; readonly costMicros: number }
  | {
      readonly outcome: 'ready';
      readonly ways: number;
      readonly dropped: number;
      readonly costMicros: number;
    };

/** The city a home code stands for ("SGN" → Ho Chi Minh City, Vietnam), or null when unknown. */
export function homeCity(origin: string): { name: string; country: string; iso2: string } | null {
  const dataset = airportDataset();
  const home = homeBaseFor(dataset, origin);
  if (home === null || home.city === '') return null;
  return {
    name: home.city,
    country: dataset.countries[home.country]?.name ?? home.country,
    iso2: home.country,
  };
}

export interface StoredHomeWay {
  readonly mode: string;
  readonly minutes: number;
  readonly cost_pp_minor: number | null;
  readonly cost_currency: string | null;
  readonly note: Readonly<Record<string, string>>;
  readonly sources: readonly { url: string; title: string; quote: string }[];
}

export function storedWay(way: HomeWay): StoredHomeWay {
  const cost = costMinor(way.cost);
  return {
    mode: way.mode,
    minutes: way.minutes,
    cost_pp_minor: cost?.minor ?? null,
    cost_currency: cost?.currency ?? null,
    note: way.note,
    sources: way.sources,
  };
}

interface Pair {
  readonly name: string;
  readonly country: string | null;
  readonly status: string | null;
  readonly expiresAt: Date | null;
}

async function loadPair(pool: pg.Pool, input: HomeLinkInput): Promise<Pair | null> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      name: string;
      country: string | null;
      status: string | null;
      expires_at: Date | null;
    }>(
      `SELECT d.name, d.country, h.status, h.expires_at
         FROM destinations d
         LEFT JOIN destination_home_links h ON h.destination_id = d.id AND h.origin_key = $2
        WHERE d.id = $1`,
      [input.destinationId, input.origin],
    );
    const row = rows[0];
    return row === undefined
      ? null
      : { name: row.name, country: row.country, status: row.status, expiresAt: row.expires_at };
  });
}

interface RunEnd {
  readonly status: 'ready' | 'declined' | 'failed';
  readonly ways: readonly StoredHomeWay[];
  readonly dropped: readonly unknown[];
  readonly error: string | null;
  readonly model: string | null;
  readonly costMicros: number;
}

/** Ends a run. A ready row keeps its ways through a later run that found none, until it expires. */
export async function endHomeLink(
  pool: pg.Pool,
  input: Pick<HomeLinkInput, 'destinationId' | 'origin'>,
  end: RunEnd,
  now: Date,
): Promise<void> {
  const days = end.status === 'ready' ? HOME_LINK_TTL_DAYS : HOME_LINK_RETRY_DAYS;
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE destination_home_links
          SET status = CASE WHEN $3 = 'ready' OR jsonb_array_length(ways) = 0 THEN $3 ELSE status END,
              ways = CASE WHEN $3 = 'ready' THEN $4::jsonb ELSE ways END,
              dropped = $5::jsonb, error = $6, model = coalesce($7, model),
              cost_micros = cost_micros + $8,
              generated_at = CASE WHEN $3 = 'ready' THEN $9::timestamptz ELSE generated_at END,
              expires_at = CASE WHEN $3 = 'failed' THEN expires_at
                                ELSE $9::timestamptz + make_interval(days => $10::int) END,
              updated_at = $9
        WHERE destination_id = $1 AND origin_key = $2`,
      [
        input.destinationId,
        input.origin,
        end.status,
        JSON.stringify(end.ways),
        JSON.stringify(end.dropped),
        end.error,
        end.model,
        end.costMicros,
        now,
        days,
      ],
    ),
  );
}

export async function runHomeLink(
  pool: pg.Pool,
  deps: Pick<DestinationBriefDeps, 'gateway' | 'search' | 'dailyCapMicros' | 'fetch' | 'now'>,
  input: HomeLinkInput,
): Promise<HomeLinkReport> {
  const now = deps.now ?? (() => new Date());
  const skipped = (reason: string): HomeLinkReport => ({ outcome: 'skipped', reason });
  const home = homeCity(input.origin);
  if (home === null) return skipped('unknown_origin');
  const pair = await loadPair(pool, input);
  if (pair === null) return skipped('missing');
  const fresh = pair.expiresAt !== null && pair.expiresAt > now();
  if (input.force !== true && fresh && pair.status !== 'failed') return skipped('exists');
  if ((await briefSpentTodayMicros(pool, now())) >= deps.dailyCapMicros)
    return skipped('daily_cap');

  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO destination_home_links
         (destination_id, origin_key, origin_name, status, requested_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $4)
       ON CONFLICT (destination_id, origin_key) DO UPDATE
          SET origin_name = EXCLUDED.origin_name, requested_at = $4, updated_at = $4,
              error = NULL, cost_micros = 0`,
      [input.destinationId, input.origin, home.name, now()],
    ),
  );
  const model = MODEL_IDS.pro;
  const end = async (reason: string, costMicros: number, dropped: readonly unknown[] = []) => {
    await endHomeLink(
      pool,
      input,
      { status: 'declined', ways: [], dropped, error: reason, model, costMicros },
      now(),
    );
    return { outcome: 'declined' as const, reason, costMicros };
  };

  const signal = input.signal;
  const from = { name: home.name, country: home.country };
  const to = briefDestination(pair.name, pair.country);
  const pages = await gatherPages(
    homeLinkQueries(home.name, pair.name, home.iso2 === 'VN' && isVietnam(pair.country)),
    [pair.name],
    deps,
    signal,
  );
  if (pages.length === 0) return end('no_pages', 0);
  const locales = profileSourceLocales(pair.country);
  const write = await deps.gateway.callModel(
    DESTINATION_BRIEF_ROUTE,
    {
      ...buildHomeLinkRequest(from, to, pages, locales),
      ...(signal === undefined ? {} : { signal }),
    },
    input.jobId === undefined ? {} : { jobId: input.jobId },
  );
  const raw = isDeclined(write.message)
    ? { decision: 'decline' }
    : parseStructuredText(textOf(write.message));
  const checked = checkHomeLinkReply(raw, from, to, pages, locales);
  if (checked.decision !== 'write') {
    return end(checked.decision === 'decline' ? 'declined' : 'unreadable', write.costMicros);
  }
  if (checked.ways.length === 0) return end('no_ways', write.costMicros, checked.dropped);
  await endHomeLink(
    pool,
    input,
    {
      status: 'ready',
      ways: checked.ways.map(storedWay),
      dropped: checked.dropped,
      error: null,
      model,
      costMicros: write.costMicros,
    },
    now(),
  );
  return {
    outcome: 'ready',
    ways: checked.ways.length,
    dropped: checked.dropped.length,
    costMicros: write.costMicros,
  };
}
