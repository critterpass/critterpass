/**
 * `places.hours_research` (docs/api-contracts-async.md §2.3; docs/product-decisions.md D23): weekly,
 * curated places without opening hours get hour proposals researched from cited web pages
 * (`hours.research` through the gateway, Tavily behind `web_search`), for an operator to verify in
 * the console. The cron payload is empty (every destination); an operator can send
 * `{destination, limit}` for one destination. Without the model or search key the job is not
 * registered. Config: `HOURS_RESEARCH_RUN_CAP` places a run (300), `HOURS_RESEARCH_MAX_USD` model
 * spend a run (2), `HOURS_RESEARCH_CONCURRENCY` places at once (4); the AI cost guard and the
 * route's kill switch stop a run as they stop every other call.
 */
import {
  createGateway,
  createTavilySearch,
  recordUsage,
  type AiUsageRecord,
  type AssertRouteOn,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import { HOURS_RESEARCH_QUEUE, hoursResearchJobSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';
import { runHoursResearch, type HoursResearchConfig } from './run';

export interface HoursResearchJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TAVILY_API_KEY?: string | undefined;
  readonly HOURS_RESEARCH_RUN_CAP?: string | undefined;
  readonly HOURS_RESEARCH_MAX_USD?: string | undefined;
  readonly HOURS_RESEARCH_CONCURRENCY?: string | undefined;
}

export const HOURS_RESEARCH_DEFAULTS: HoursResearchConfig = {
  runCap: 300,
  maxUsd: 2,
  concurrency: 4,
};

/** Search pages can be slow; one place waits this long before it counts as failed. */
const SEARCH_TIMEOUT_MS = 20_000;

function positive(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function hoursResearchConfig(env: HoursResearchJobsEnv): HoursResearchConfig {
  return {
    runCap: Math.floor(positive(env.HOURS_RESEARCH_RUN_CAP, HOURS_RESEARCH_DEFAULTS.runCap)),
    maxUsd: positive(env.HOURS_RESEARCH_MAX_USD, HOURS_RESEARCH_DEFAULTS.maxUsd),
    concurrency: Math.min(
      16,
      Math.floor(positive(env.HOURS_RESEARCH_CONCURRENCY, HOURS_RESEARCH_DEFAULTS.concurrency)),
    ),
  };
}

export function hoursResearchJobs(
  env: HoursResearchJobsEnv,
  pool: pg.Pool,
  logger: JobLogger,
  assertRouteOn: AssertRouteOn,
): AnyJobDefinition[] {
  const modelKey = env.ANTHROPIC_API_KEY;
  const searchKey = env.TAVILY_API_KEY;
  if (modelKey === undefined || modelKey === '' || searchKey === undefined || searchKey === '') {
    logger.warn({}, 'places.hours_research is off: ANTHROPIC_API_KEY or TAVILY_API_KEY is unset');
    return [];
  }
  const onUsage = (record: AiUsageRecord) => recordUsage((fn) => withSystem(pool, fn), record);
  const deps = {
    gateway: createGateway({
      apiKey: modelKey,
      ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
      onUsage,
      assertRouteOn,
    }),
    search: createTavilySearch({ apiKey: searchKey, timeoutMs: SEARCH_TIMEOUT_MS }),
  };
  const config = hoursResearchConfig(env);
  return [
    defineJob({
      queue: HOURS_RESEARCH_QUEUE,
      schema: hoursResearchJobSchema.nullish(),
      async handler(data, { pool: jobPool, logger: jobLogger, job }) {
        const report = await runHoursResearch(
          jobPool,
          deps,
          config,
          {
            ...(data?.destination === undefined ? {} : { destination: data.destination }),
            ...(data?.limit === undefined ? {} : { limit: data.limit }),
            signal: job.signal,
          },
          jobLogger,
        );
        jobLogger.info({ ...report }, 'hours research finished');
        return { ...report };
      },
    }),
  ];
}
