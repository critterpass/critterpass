/**
 * The single model entry point: `callModel(route, input)` / `streamModel(route, input)`. Generation
 * runs on DeepSeek through its Anthropic-compatible Messages API;
 * this module is the provider seam, so a second provider plugs in here behind the same interface.
 * It adds a request timeout, jittered retries on transient statuses only, refusal mapping, and one
 * usage record (with `cost_micros`) per call handed to `onUsage`. A call the provider may have
 * billed without answering (a timeout, or a stream that broke after it started) still leaves a
 * record, with the tokens it reported so far (none for a timeout) and their cost.
 *
 * Provider rules enforced here, so callers never depend on a feature the provider lacks:
 * - structured output: DeepSeek ignores `output_config.format`, so a requested JSON format becomes
 *   a system instruction carrying the schema, and a non-streamed call whose reply is not a JSON
 *   value is repaired once in a follow-up turn (callers still validate the shape);
 * - refusals: there is no `refusal` stop reason, so the global rules ask for `DECLINE_MARKER` as the
 *   whole reply; it maps to `AI_REFUSED` and is never streamed to a client;
 * - tool choice: `any` is not enforced and a forced tool is rejected with thinking on, so both are
 *   configuration errors; `temperature` only applies without thinking.
 */
import Anthropic, { APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk';
import type { AiRoute } from '@cp/domain';

import { DEEPSEEK_ANTHROPIC_URL } from './env';
import {
  GatewayConfigError,
  GatewayError,
  isRetryableProviderError,
  toGatewayError,
} from './errors';
import { computeCostMicros, type TokenUsage } from './pricing';
import { resolveGenerationRoute, type RouteConfig } from './routing';
import {
  isDeclined,
  parseStructuredText,
  REPAIR_INSTRUCTION,
  structuredInstruction,
  textOf,
} from './structured';
import { DeclineGuard } from './decline-guard';
import type { Telemetry } from './telemetry/langfuse';
import {
  buildUsageRecord,
  NO_TOKENS,
  readStreamUsage,
  toTokenUsage,
  type AiUsageRecord,
  type UsageContext,
} from './usage';

type MessageParams = Anthropic.Messages.MessageCreateParamsNonStreaming;
type StreamEvent = Anthropic.Messages.RawMessageStreamEvent;

export interface GatewayInput {
  readonly system?: string | readonly Anthropic.Messages.TextBlockParam[];
  readonly messages: readonly Anthropic.Messages.MessageParam[];
  readonly tools?: readonly Anthropic.Messages.ToolUnion[];
  readonly toolChoice?: Anthropic.Messages.ToolChoice;
  /** Honoured on routes without thinking only (thinking ignores sampling parameters). */
  readonly temperature?: number;
  /** The JSON Schema the reply must follow; sent as an instruction, validated by the caller. */
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
  | { readonly kind: 'delta'; readonly event: StreamEvent }
  | { readonly kind: 'done'; readonly result: GatewayResult };

/** The ops kill-switch check for one route; throws `STATE_INVALID switched_off` when it is off. */
export type AssertRouteOn = (route: AiRoute) => Promise<void>;

export interface GatewayOptions {
  readonly apiKey: string;
  /** Explicit endpoint override (see ./env.ts); unset = DeepSeek's Anthropic-format API. */
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
  /**
   * The ops kill switches: runs before any provider request and throws (`STATE_INVALID
   * switched_off`) when the route, its tier or the cost guard has it off, so a paused call fails
   * fast and never reaches the provider.
   */
  readonly assertRouteOn?: AssertRouteOn;
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
/** DeepSeek ignores the thinking budget; the Messages format still requires one. */
const MIN_THINKING_BUDGET = 1024;

function systemWith(
  system: GatewayInput['system'],
  extra: string | undefined,
): string | Anthropic.Messages.TextBlockParam[] | undefined {
  if (extra === undefined) return typeof system === 'string' ? system : system && [...system];
  if (system === undefined) return extra;
  const blocks = typeof system === 'string' ? [{ type: 'text' as const, text: system }] : system;
  return [...blocks, { type: 'text', text: extra }];
}

/** Builds the Messages API request for a route, enforcing the provider's request rules. */
export function buildMessageParams(route: RouteConfig, input: GatewayInput): MessageParams {
  if (route.provider !== 'deepseek') {
    throw new GatewayConfigError(`route ${route.route} runs on ${route.provider}, not DeepSeek`);
  }
  if (input.toolChoice?.type === 'any') {
    throw new GatewayConfigError(`route ${route.route}: tool_choice any is not enforced`);
  }
  if (input.toolChoice?.type === 'tool' && route.thinking === 'enabled') {
    throw new GatewayConfigError(
      `route ${route.route}: a forced tool is rejected with thinking on; use auto`,
    );
  }
  if (input.tools !== undefined && input.tools.length > 0 && route.caller === null) {
    throw new GatewayConfigError(`route ${route.route} has no tool allow-list`);
  }
  const thinking: Anthropic.Messages.ThinkingConfigParam =
    route.thinking === 'enabled'
      ? { type: 'enabled', budget_tokens: Math.max(MIN_THINKING_BUDGET, route.maxTokens >> 1) }
      : { type: 'disabled' };
  const temperature = input.temperature ?? route.temperature;
  const system = systemWith(
    input.system,
    input.outputFormat === undefined ? undefined : structuredInstruction(input.outputFormat),
  );
  return {
    model: route.model,
    max_tokens: route.maxTokens,
    messages: [...input.messages],
    thinking,
    ...(system === undefined ? {} : { system }),
    ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
    ...(input.toolChoice === undefined ? {} : { tool_choice: input.toolChoice }),
    ...(route.thinking === 'enabled' && route.effort !== undefined
      ? { output_config: { effort: route.effort } }
      : {}),
    ...(temperature !== undefined && route.thinking === 'disabled' ? { temperature } : {}),
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
    baseURL: options.baseURL ?? DEEPSEEK_ANTHROPIC_URL,
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

  /** Bills one response and maps a refusal; returns the settled result. */
  async function settle(
    route: RouteConfig,
    message: Anthropic.Messages.Message,
    context: UsageContext,
    startedAt: Date,
  ): Promise<GatewayResult> {
    const usage = toTokenUsage(message.usage);
    const endedAt = now();
    const costMicros = computeCostMicros(route.tier, usage, endedAt);
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
      route: route.route,
      model: route.model,
      tier: route.tier,
      usage,
      costMicros,
      context: { ...context, langfuseTraceId: traceId },
      at: endedAt,
    });
    // A refusal still bills its tokens, so the usage row is written before the error is raised.
    await options.onUsage?.(record);
    if (message.stop_reason === 'refusal' || isDeclined(message)) {
      throw new GatewayError('AI_REFUSED', 'model declined the request', {
        detail: { route: route.route, category: message.stop_details?.category ?? null },
      });
    }
    return { route, message, usage, costMicros };
  }

  /**
   * Records a call that ended without a reply the provider may still bill. Recording never masks
   * the call's own failure, which is the error the caller sees.
   */
  async function billUnsettled(
    route: RouteConfig,
    usage: TokenUsage,
    context: UsageContext,
  ): Promise<void> {
    const at = now();
    const record = buildUsageRecord({
      route: route.route,
      model: route.model,
      tier: route.tier,
      usage,
      costMicros: computeCostMicros(route.tier, usage, at),
      context,
      at,
    });
    await options.onUsage?.(record).catch(() => undefined);
  }

  /** A request that timed out was sent and may have been generated in full. */
  const timedOut = (error: unknown): boolean =>
    error instanceof APIConnectionTimeoutError ||
    (error instanceof GatewayError && error.cause instanceof APIConnectionTimeoutError);

  async function create(
    route: RouteConfig,
    params: MessageParams,
    signal: AbortSignal | undefined,
    context: UsageContext,
  ): Promise<Anthropic.Messages.Message> {
    const requestOptions = signal === undefined ? {} : { signal };
    try {
      return await withRetry(() => client.messages.create(params, requestOptions));
    } catch (error) {
      if (timedOut(error)) await billUnsettled(route, NO_TOKENS, context);
      throw error;
    }
  }

  return {
    async callModel(routeId, input, context = {}) {
      await options.assertRouteOn?.(routeId);
      const route = resolveGenerationRoute(routeId);
      const params = buildMessageParams(route, input);
      const startedAt = now();
      const message = await create(route, params, input.signal, context);
      const first = await settle(route, message, context, startedAt);
      if (input.outputFormat === undefined || message.stop_reason === 'tool_use') return first;
      if (parseStructuredText(textOf(message)) !== undefined) return first;
      // One repair turn for a reply that is not JSON; the caller validates the shape either way.
      const repair: MessageParams = {
        ...params,
        messages: [
          ...params.messages,
          { role: 'assistant', content: message.content },
          { role: 'user', content: REPAIR_INSTRUCTION },
        ],
      };
      return settle(route, await create(route, repair, input.signal, context), context, now());
    },

    async *streamModel(routeId, input, context = {}) {
      await options.assertRouteOn?.(routeId);
      const route = resolveGenerationRoute(routeId);
      const params = buildMessageParams(route, input);
      const startedAt = now();
      for (let attempt = 1; ; attempt += 1) {
        let started = false;
        let settled = false;
        let failure: unknown;
        let known = NO_TOKENS;
        try {
          const stream = client.messages.stream(
            params,
            input.signal === undefined ? {} : { signal: input.signal },
          );
          const guard = new DeclineGuard();
          for await (const event of stream) {
            started = true;
            known = readStreamUsage(known, event);
            for (const released of guard.push(event)) yield { kind: 'delta', event: released };
          }
          for (const released of guard.flush()) yield { kind: 'delta', event: released };
          const message = await stream.finalMessage();
          // `settle` writes the usage record itself, refusal included.
          settled = true;
          yield { kind: 'done', result: await settle(route, message, context, startedAt) };
          return;
        } catch (error) {
          failure = error;
          // Only a stream that failed before its first event can be retried transparently.
          if (started || !isRetryableProviderError(error) || attempt >= maxAttempts) {
            throw toGatewayError(error);
          }
          await sleep(backoff(attempt, error));
        } finally {
          // A stream that broke, or was abandoned, after it started is billed on what it reported.
          if (!settled && (started || timedOut(failure))) {
            await billUnsettled(route, known, context);
          }
        }
      }
    },
  };
}
