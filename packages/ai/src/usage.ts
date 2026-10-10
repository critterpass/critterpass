/**
 * Usage accounting: every model call becomes one `ai_usage` row (docs/data-model.md §3.18) with its
 * `cost_micros`, written as `app_system`. `packages/ai` stays free of `@cp/db`; the service passes
 * its `withSystem` bound to a pool, so the insert still runs inside a system-role transaction.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AiRoute, AiTier } from '@cp/domain';

import type { TokenUsage } from './pricing';

/** Maps the API's usage block onto billed token classes. */
export function toTokenUsage(usage: Anthropic.Messages.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    outputTokens: usage.output_tokens,
  };
}

/** No tokens reported: a call that failed before the provider said anything about its usage. */
export const NO_TOKENS: TokenUsage = {
  inputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
};

const count = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;

/**
 * The tokens a stream has reported so far: `message_start` carries the prompt's, each
 * `message_delta` the running output count. A stream that breaks part-way is billed on these.
 */
export function readStreamUsage(
  known: TokenUsage,
  event: Anthropic.Messages.RawMessageStreamEvent,
): TokenUsage {
  if (event.type === 'message_start') {
    const usage = event.message.usage;
    return {
      inputTokens: count(usage.input_tokens, 0),
      cacheWriteTokens: count(usage.cache_creation_input_tokens, 0),
      cacheReadTokens: count(usage.cache_read_input_tokens, 0),
      outputTokens: count(usage.output_tokens, 0),
    };
  }
  if (event.type !== 'message_delta') return known;
  const usage = event.usage;
  return {
    inputTokens: count(usage.input_tokens, known.inputTokens),
    cacheWriteTokens: count(usage.cache_creation_input_tokens, known.cacheWriteTokens),
    cacheReadTokens: count(usage.cache_read_input_tokens, known.cacheReadTokens),
    outputTokens: count(usage.output_tokens, known.outputTokens),
  };
}

/** Who and what a call is billed to; every field is optional (system jobs have no user). */
export interface UsageContext {
  readonly userId?: string | null;
  readonly tripId?: string | null;
  /** Tags the trace for per-crew cost; not stored on the usage row. */
  readonly crewId?: string | null;
  readonly jobId?: string | null;
  readonly langfuseTraceId?: string | null;
}

/** One `ai_usage` row. */
export interface AiUsageRecord {
  readonly userId: string | null;
  readonly tripId: string | null;
  readonly jobId: string | null;
  readonly model: string;
  readonly tier: AiTier;
  /** The gateway route that made the call (`guide.chat`, `draft.skeleton`, ...); spend per route. */
  readonly route: AiRoute | null;
  /** Every prompt token: uncached input + cache writes + cache reads. */
  readonly tokensIn: number;
  readonly tokensOut: number;
  /** The cache-read share of `tokensIn` (cache-hit rate = cacheRead / tokensIn). */
  readonly cacheRead: number;
  readonly costMicros: number;
  readonly langfuseTraceId: string | null;
  readonly at: Date;
}

export interface BuildUsageRecordInput {
  readonly model: string;
  readonly tier: AiTier;
  readonly route?: AiRoute | null;
  readonly usage: TokenUsage;
  readonly costMicros: number;
  readonly context: UsageContext;
  readonly at: Date;
}

export function buildUsageRecord(input: BuildUsageRecordInput): AiUsageRecord {
  const { usage, context } = input;
  return {
    userId: context.userId ?? null,
    tripId: context.tripId ?? null,
    jobId: context.jobId ?? null,
    model: input.model,
    tier: input.tier,
    route: input.route ?? null,
    tokensIn: usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens,
    tokensOut: usage.outputTokens,
    cacheRead: usage.cacheReadTokens,
    costMicros: input.costMicros,
    langfuseTraceId: context.langfuseTraceId ?? null,
    at: input.at,
  };
}

/** The slice of a `pg` client the insert needs. */
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** `(fn) => withSystem(pool, fn)` from `@cp/db`, bound by the calling service. */
export type RunAsSystem = <T>(fn: (tx: SqlClient) => Promise<T>) => Promise<T>;

const INSERT_USAGE = `INSERT INTO ai_usage
  (user_id, trip_id, job_id, model, tier, tokens_in, tokens_out, cache_read, cost_micros, langfuse_trace_id, at, route)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;

export async function recordUsage(runAsSystem: RunAsSystem, record: AiUsageRecord): Promise<void> {
  await runAsSystem((tx) =>
    tx.query(INSERT_USAGE, [
      record.userId,
      record.tripId,
      record.jobId,
      record.model,
      record.tier,
      record.tokensIn,
      record.tokensOut,
      record.cacheRead,
      record.costMicros,
      record.langfuseTraceId,
      record.at,
      record.route,
    ]),
  );
}
