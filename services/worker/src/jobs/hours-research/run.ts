/**
 * One opening-hours research run: curated, active places with no hours, no open proposal and no
 * rejection in the last `REJECTED_RETRY_DAYS`, in an order that changes every week (so places that
 * declined do not take the cap every run), capped per run. Each place goes through `hours.research`
 * with bounded concurrency; a proposal becomes a `poi_hours_proposals` row that an operator verifies
 * in the console. The run stops early at its AI spend cap or when the route is switched off (the
 * kill switch, or the AI cost guard pausing the tier).
 */
import {
  researchPlaceHours,
  type HoursProposal,
  type HoursResearchDeps,
  type HoursResearchPlace,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import { HOURS_RESEARCH_SKIPPED_CATEGORIES, switchedOffKey } from '@cp/domain';
import type pg from 'pg';

import type { JobLogger } from '../../boss/define-job';

/** A rejected proposal keeps its place out of research this long. */
export const REJECTED_RETRY_DAYS = 90;

export interface HoursResearchConfig {
  /** Places researched per run. */
  readonly runCap: number;
  /** Model spend per run, in USD; the run stops once it is reached. */
  readonly maxUsd: number;
  /** Places researched at once. */
  readonly concurrency: number;
}

export interface HoursResearchOptions {
  readonly destination?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface HoursResearchReport {
  readonly selected: number;
  readonly researched: number;
  readonly proposed: number;
  readonly declined: Readonly<Record<string, number>>;
  readonly failed: number;
  readonly spend_usd: number;
  /** Set when the run stopped before its list ended. */
  readonly stopped?: 'spend_cap' | 'switched_off';
}

interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly address: string | null;
  readonly category: string;
  readonly city: string;
  readonly country: string | null;
}

/** ISO week start (Monday, UTC) of `now`: the seed of this week's order. */
function weekSeed(now: Date): string {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(now.getTime() - day * 86_400_000).toISOString().slice(0, 10);
}

export async function placesToResearch(
  pool: pg.Pool,
  options: { readonly destination?: string; readonly limit: number; readonly now: Date },
): Promise<PlaceRow[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<PlaceRow>(
      `SELECT p.id, p.name, p.name_local, p.address, p.category, d.name AS city, d.country
       FROM pois p
       JOIN destinations d ON d.id = p.destination_id
       WHERE p.curation = 'editorial' AND p.status = 'active'
         AND NOT jsonb_path_exists(p.hours, '$.weekly.*[*]')
         AND p.category <> ALL ($2::text[])
         AND ($1::text IS NULL OR d.slug = $1)
         AND NOT EXISTS (
           SELECT 1 FROM poi_hours_proposals h
           WHERE h.poi_id = p.id
             AND (h.status = 'proposed'
                  OR (h.status = 'rejected' AND h.decided_at > now() - make_interval(days => $3)))
         )
       ORDER BY md5(p.id::text || $4)
       LIMIT $5`,
      [
        options.destination ?? null,
        [...HOURS_RESEARCH_SKIPPED_CATEGORIES],
        REJECTED_RETRY_DAYS,
        weekSeed(options.now),
        options.limit,
      ],
    );
    return rows;
  });
}

/**
 * The batch key shows the operator when the research ran and how sure the model was, e.g.
 * `research:2026-10-05:0.90`; one proposal per place and batch.
 */
export function researchBatchKey(now: Date, confidence: number): string {
  return `research:${now.toISOString().slice(0, 10)}:${confidence.toFixed(2)}`;
}

async function writeProposal(
  pool: pg.Pool,
  poiId: string,
  proposal: HoursProposal,
  now: Date,
): Promise<boolean> {
  const result = await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO poi_hours_proposals (poi_id, hours, source_url, fetched_at, batch_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (poi_id, batch_key) DO NOTHING`,
      [
        poiId,
        JSON.stringify(proposal.hours),
        proposal.sourceUrl,
        proposal.fetchedAt,
        researchBatchKey(now, proposal.confidence),
      ],
    ),
  );
  return (result.rowCount ?? 0) > 0;
}

function placeOf(row: PlaceRow): HoursResearchPlace {
  return {
    name: row.name,
    localName: row.name_local,
    address: row.address,
    city: [row.city, row.country].filter(Boolean).join(', '),
    category: row.category,
  };
}

export async function runHoursResearch(
  pool: pg.Pool,
  deps: HoursResearchDeps,
  config: HoursResearchConfig,
  options: HoursResearchOptions,
  logger: JobLogger,
): Promise<HoursResearchReport> {
  const now = (deps.now ?? (() => new Date()))();
  const places = await placesToResearch(pool, {
    ...(options.destination === undefined ? {} : { destination: options.destination }),
    limit: options.limit ?? config.runCap,
    now,
  });
  const maxMicros = config.maxUsd * 1_000_000;
  const declined: Record<string, number> = {};
  let next = 0;
  let researched = 0;
  let proposed = 0;
  let failed = 0;
  let spentMicros = 0;
  const run: { stopped?: NonNullable<HoursResearchReport['stopped']> } = {};

  const worker = async (): Promise<void> => {
    while (run.stopped === undefined && next < places.length && options.signal?.aborted !== true) {
      if (spentMicros >= maxMicros) {
        run.stopped = 'spend_cap';
        return;
      }
      const row = places[next++] as PlaceRow;
      try {
        const result = await researchPlaceHours(deps, placeOf(row), {
          ...(options.signal ? { signal: options.signal } : {}),
        });
        researched += 1;
        spentMicros += result.costMicros;
        if (result.ok) {
          if (await writeProposal(pool, row.id, result.proposal, now)) proposed += 1;
        } else {
          declined[result.reason] = (declined[result.reason] ?? 0) + 1;
        }
      } catch (error) {
        const key = switchedOffKey(error);
        if (key !== undefined) {
          // Switched off in the ops console or paused by the cost guard: every other place
          // would be refused the same way.
          logger.info({ key }, 'hours research stopped: switched off');
          run.stopped = 'switched_off';
          return;
        }
        failed += 1;
        logger.warn({ err: error, poi: row.id }, 'hours research failed for a place');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, config.concurrency) }, worker));

  return {
    selected: places.length,
    researched,
    proposed,
    declined,
    failed,
    spend_usd: spentMicros / 1_000_000,
    ...(run.stopped === undefined ? {} : { stopped: run.stopped }),
  };
}
