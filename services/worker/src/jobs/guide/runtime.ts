/**
 * What the worker's guide jobs share: the gateway (DeepSeek through its Anthropic-format API), the
 * typed-decision client, the tools the worker can run for the guide (crew profiles, the plan,
 * phrase cards and, with a search key, web search) and the crew-turn ports over Postgres.
 */
import {
  createDecisionClient,
  createGateway,
  createToolRegistry,
  createWebSearchExecutor,
  crewNameTerms,
  recordUsage,
  registerGuideToolExecutors,
  searchProviderFromEnv,
  type AssertRouteOn,
  type CrewTurnPorts,
  type DecisionClient,
  type Gateway,
  type RunAsGuideReader,
  type Telemetry,
  type ToolRegistry,
} from '@cp/ai';
import { outbox, withGuideReader, withSystem } from '@cp/db';
import type pg from 'pg';

import { privacyRedactionKeys } from '../../obs/logger';
import { reserveGuideAnswer } from './meter';

export interface GuideJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TAVILY_API_KEY?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
}

export interface GuideJobsDeps {
  readonly pool: pg.Pool;
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
}

export interface GuideRuntime {
  readonly pool: pg.Pool;
  readonly gateway: Gateway;
  readonly decisions: DecisionClient;
  readonly registry: ToolRegistry;
  readonly assertRouteOn: AssertRouteOn;
}

export function guideReader(pool: pg.Pool): RunAsGuideReader {
  return (uid, tripId, fn) => withGuideReader(pool, uid, tripId ?? '', fn);
}

/** The runtime, or undefined without a model key (the guide jobs are then not registered). */
export function guideRuntime(env: GuideJobsEnv, deps: GuideJobsDeps): GuideRuntime | undefined {
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  const onUsage = (record: Parameters<typeof recordUsage>[1]) =>
    recordUsage((fn) => withSystem(deps.pool, fn), record);
  const telemetry = deps.telemetry === undefined ? {} : { telemetry: deps.telemetry };
  const gateway = createGateway({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    ...telemetry,
    assertRouteOn: deps.assertRouteOn,
    onUsage,
  });
  const decisions = createDecisionClient({
    apiKey: env.TYPESAFE_API_KEY,
    gateway,
    assertRouteOn: deps.assertRouteOn,
    ...telemetry,
    onUsage,
  });
  const registry = createToolRegistry();
  registerGuideToolExecutors(registry, guideReader(deps.pool));
  const search = searchProviderFromEnv({ TAVILY_API_KEY: env.TAVILY_API_KEY });
  if (search !== undefined) {
    // Crew names never leave in a query.
    const privateTerms = crewNameTerms(guideReader(deps.pool));
    registry.registerToolExecutor('web_search', createWebSearchExecutor(search, { privateTerms }));
  }
  return { pool: deps.pool, gateway, decisions, registry, assertRouteOn: deps.assertRouteOn };
}

/** The asker's device zone: the one they were last seen in (UTC when none). */
export async function askerTz(pool: pg.Pool, uid: string): Promise<string> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ tz: string }>(
      'SELECT tz FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1',
      [uid],
    ),
  );
  return rows[0]?.tz ?? 'UTC';
}

export function crewTurnPorts(runtime: GuideRuntime): CrewTurnPorts {
  const { pool } = runtime;
  return {
    gateway: runtime.gateway,
    registry: runtime.registry,
    runAsSystem: (fn) => withSystem(pool, fn),
    runAsGuideReader: guideReader(pool),
    redactKeys: privacyRedactionKeys(),
    publish: async (tx, channel, type, data) => {
      await outbox(tx as pg.PoolClient, channel, type, data);
    },
    reserve: async (input) =>
      reserveGuideAnswer(pool, {
        uid: input.uid,
        tz: await askerTz(pool, input.uid),
        tripId: input.tripId,
        isCrewChat: true,
        crewPassHolders: input.crewPassHolders,
      }),
  };
}
