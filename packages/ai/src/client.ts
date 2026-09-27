/**
 * The single model entry point: `callModel(route, input)` / `streamModel(route, input)`. Wraps the
 * Anthropic SDK with a request timeout, jittered retries on 429/529 only, refusal mapping, and one
 * usage record (with `cost_micros`) per call handed to `onUsage`.
 */
import Anthropic, { APIError } from '@anthropic-ai/sdk';
import type { AiRoute } from '@cp/domain';

import { ANTHROPIC_API_URL } from './env';
import {
  GatewayConfigError,
  GatewayError,
  isRetryableProviderError,
  toGatewayError,
} from './errors';
import { computeCostMicros, type TokenUsage } from './pricing';
import { resolveClaudeRoute, type RouteConfig } from './routing';
import type { Telemetry } from './telemetry/langfuse';
import { buildUsageRecord, toTokenUsage, type AiUsageRecord, type UsageContext } from './usage';

type MessageParams = Anthropic.Messages.MessageCreateParamsNonStreaming;

export interface GatewayInput {
  readonly system?: string | readonly Anthropic.Messages.TextBlockParam[];
  readonly messages: readonly Anthropic.Messages.MessageParam[];
  readonly tools?: readonly Anthropic.Messages.ToolUnion[];
  readonly toolChoice?: Anthropic.Messages.ToolChoice;
  /** Honoured on Haiku only: Sonnet 5 and Opus 5.5 reject non-default sampling parameters. */
  readonly temperature?: number;
  readonly outputFormat?: Anthropic.Messages.JSONOutputFormat;
  /** Cancels the request (client disconnect); an aborted call is never retried. */
  readonly signal?: AbortSignal;
}

export interface GatewayResult {
  readonly route: RouteConfig;
  readonly message: Anthropic.Messages.Message;
  readonly usage: TokenUsage;
  readonly costMicros: number;
}

export type GatewayStreamEvent =
  | { readonly kind: 'delta'; readonly event: Anthropic.Messages.RawMessageStreamEvent }
  | { readonly kind: 'done'; readonly result: GatewayResult };

export interface GatewayOptions {
  readonly apiKey: string;
  /** Explicit endpoint override (see ./env.ts); unset = Anthropic's API. */
  readonly baseURL?: string;
  readonly timeoutMs?: number;
  /** Total attempts per call, including the first. */
  readonly maxAttempts?: number;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
  readonly onUsage?: (record: AiUsageRecord) => Promise<void>;
  /** Langfuse spans; the trace id lands on the call's `ai_usage` row. */
  readonly telemetry?: Telemetry;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => Date;
}

export interface Gateway {
  callModel(route: AiRoute, input: GatewayInput, context?: UsageContext): Promise<GatewayResult>;
  streamModel(
    route: AiRoute,
    input: GatewayInput,
    context?: UsageContext,
  ): AsyncGenerator<GatewayStreamEvent, void, undefined>;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

/** Builds the Messages API request for a route, enforcing the per-model request rules. */
export function buildMessageParams(route: RouteConfig, input: GatewayInput): MessageParams {
  if (route.provider !== 'claude') {
    throw new GatewayConfigError(`route ${route.route} runs on ${route.provider}, not Claude`);
  }
  const forced = input.toolChoice?.type === 'any' || input.toolChoice?.type === 'tool';
  if (forced && (route.tier === 'opus' || route.thinking === 'adaptive')) {
    throw new GatewayConfigError(
      `route ${route.route}: forced tool_choice is rejected with thinking on; use auto + strict tools`,
    );
  }
  if (input.tools !== undefined && input.tools.length > 0 && route.caller === null) {
    throw new GatewayConfigError(`route ${route.route} has no tool allow-list`);
  }
  const outputConfig: Anthropic.Messages.OutputConfig = {
    ...(route.effort === undefined ? {} : { effort: route.effort }),
    ...(input.outputFormat === undefined ? {} : { format: input.outputFormat }),
  };
  return {
    model: route.model,
    max_tokens: route.maxTokens,
    messages: [...input.messages],
    thinking: { type: route.thinking },
    ...(input.system === undefined
      ? {}
      : { system: typeof input.system === 'string' ? input.system : [...input.system] }),
    ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
    ...(input.toolChoice === undefined ? {} : { tool_choice: input.toolChoice }),
    ...(Object.keys(outputConfig).length === 0 ? {} : { output_config: outputConfig }),
    ...(input.temperature !== undefined && route.tier === 'haiku'
      ? { temperature: input.temperature }
      : {}),
  };
}

function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof APIError)) return undefined;
  // The SDK types `headers` through its own fetch shims; at runtime it is the response's Headers.
  const headers = error.headers as Headers | undefined;
  const header = headers?.get('retry-after');
  const seconds = header === null || header === undefined ? Number.NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, MAX_DELAY_MS)
    : undefined;
}

export function createGateway(options: GatewayOptions): Gateway {
  const client = new Anthropic({
    apiKey: options.apiKey,
    maxRetries: 0,
    timeout: options.timeoutMs ?? 60_000,
    // Always explicit: the SDK would otherwise read ANTHROPIC_BASE_URL from the process env.
    baseURL: options.baseURL ?? ANTHROPIC_API_URL,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => new Date());

  const backoff = (attempt: number, error: unknown): number =>
    retryAfterMs(error) ??
    Math.floor(random() * Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1)));

  async function withRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (!isRetryableProviderError(error) || attempt >= maxAttempts) {
          throw toGatewayError(error);
        }
        await sleep(backoff(attempt, error));
      }
    }
  }

  async function settle(
    route: RouteConfig,
    message: Anthropic.Messages.Message,
    context: UsageContext,
    startedAt: Date,
  ): Promise<GatewayResult> {
    const usage = toTokenUsage(message.usage);
    const costMicros = computeCostMicros(route.tier, usage);
    const endedAt = now();
    const toolCalls = message.content.flatMap((block) =>
      block.type === 'tool_use' ? [{ name: block.name, input: block.input }] : [],
    );
    const traceId =
      context.langfuseTraceId ??
      options.telemetry?.recordGeneration({
        route: route.route,
        model: route.model,
        tier: route.tier,
        usage,
        costMicros,
        startedAt,
        endedAt,
        stopReason: message.stop_reason,
        userId: context.userId ?? null,
        tripId: context.tripId ?? null,
        crewId: context.crewId ?? null,
        jobId: context.jobId ?? null,
        ...(toolCalls.length === 0 ? {} : { output: toolCalls }),
      }) ??
      null;
    const record = buildUsageRecord({
      model: route.model,
      tier: route.tier,
      usage,
      costMicros,
      context: { ...context, langfuseTraceId: traceId },
      at: endedAt,
    });
    // A refusal still bills its tokens, so the usage row is written before the error is raised.
    await options.onUsage?.(record);
    if (message.stop_reason === 'refusal') {
      throw new GatewayError('AI_REFUSED', 'model declined the request', {
        detail: { route: route.route, category: message.stop_details?.category ?? null },
      });
    }
    return { route, message, usage, costMicros };
  }

  return {
    async callModel(routeId, input, context = {}) {
      const route = resolveClaudeRoute(routeId);
      const params = buildMessageParams(route, input);
      const options = input.signal === undefined ? {} : { signal: input.signal };
      const startedAt = now();
      const message = await withRetry(() => client.messages.create(params, options));
      return settle(route, message, context, startedAt);
    },

    async *streamModel(routeId, input, context = {}) {
      const route = resolveClaudeRoute(routeId);
      const params = buildMessageParams(route, input);
      const startedAt = now();
      for (let attempt = 1; ; attempt += 1) {
        let started = false;
        try {
          const stream = client.messages.stream(
            params,
            input.signal === undefined ? {} : { signal: input.signal },
          );
          for await (const event of stream) {
            started = true;
            yield { kind: 'delta', event };
          }
          const message = await stream.finalMessage();
          yield { kind: 'done', result: await settle(route, message, context, startedAt) };
          return;
        } catch (error) {
          // Only a stream that failed before its first event can be retried transparently.
          if (started || !isRetryableProviderError(error) || attempt >= maxAttempts) {
            throw toGatewayError(error);
          }
          await sleep(backoff(attempt, error));
        }
      }
    },
  };
}
