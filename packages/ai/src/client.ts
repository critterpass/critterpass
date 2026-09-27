/**
 * The single model entry point: `callModel(route, input)` / `streamModel(route, input)`. Generation
 * runs on DeepSeek through its Anthropic-compatible Messages API (docs/product-decisions.md D22);
 * this module is the provider seam, so a second provider plugs in here behind the same interface.
 * It adds a request timeout, jittered retries on transient statuses only, refusal mapping, and one
 * usage record (with `cost_micros`) per call handed to `onUsage`.
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
import Anthropic, { APIError } from '@anthropic-ai/sdk';
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
  DECLINE_MARKER,
  isDeclined,
  parseStructuredText,
  REPAIR_INSTRUCTION,
  structuredInstruction,
  textOf,
} from './structured';
import type { Telemetry } from './telemetry/langfuse';
import { buildUsageRecord, toTokenUsage, type AiUsageRecord, type UsageContext } from './usage';

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

function textDelta(event: StreamEvent): string | undefined {
  return event.type === 'content_block_delta' && event.delta.type === 'text_delta'
    ? event.delta.text
    : undefined;
}

/**
 * Holds a stream's first text until it can tell a decline marker from an answer: an answer's
 * events are released in order, a declined reply's text never leaves the gateway.
 */
class DeclineGuard {
  private held: StreamEvent[] = [];
  private text = '';
  private decided = false;
  declined = false;

  /** Events that may be yielded now. */
  push(event: StreamEvent): StreamEvent[] {
    const text = textDelta(event);
    if (this.decided) return this.declined && text !== undefined ? [] : [event];
    if (text === undefined && this.held.length === 0) return [event];
    this.held.push(event);
    this.text += text ?? '';
    const head = this.text.trimStart();
    if (head.length < DECLINE_MARKER.length && DECLINE_MARKER.startsWith(head)) return [];
    return this.decide();
  }

  /** Called at the end of the stream: whatever is still held is decided now. */
  flush(): StreamEvent[] {
    return this.decided ? [] : this.decide();
  }

  private decide(): StreamEvent[] {
    this.decided = true;
    this.declined = this.text.trimStart().startsWith(DECLINE_MARKER);
    const released = this.declined
      ? this.held.filter((event) => textDelta(event) === undefined)
      : this.held;
    this.held = [];
    return released;
  }
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

  async function create(
    params: MessageParams,
    signal: AbortSignal | undefined,
  ): Promise<Anthropic.Messages.Message> {
    const requestOptions = signal === undefined ? {} : { signal };
    return withRetry(() => client.messages.create(params, requestOptions));
  }

  return {
    async callModel(routeId, input, context = {}) {
      const route = resolveGenerationRoute(routeId);
      const params = buildMessageParams(route, input);
      const startedAt = now();
      const message = await create(params, input.signal);
      const first = await settle(route, message, context, startedAt);
      if (input.outputFormat === undefined || message.stop_reason === 'tool_use') return first;
      if (parseStructuredText(textOf(message)) !== undefined) return first;
      // One repair turn for a reply that is not JSON; the caller validates the shape either way.
      const repair: MessageParams = {
        ...params,
        messages: [
          ...params.messages,
          { role: 'assistant', content: message.content as Anthropic.Messages.ContentBlockParam[] },
          { role: 'user', content: REPAIR_INSTRUCTION },
        ],
      };
      return settle(route, await create(repair, input.signal), context, now());
    },

    async *streamModel(routeId, input, context = {}) {
      const route = resolveGenerationRoute(routeId);
      const params = buildMessageParams(route, input);
      const startedAt = now();
      for (let attempt = 1; ; attempt += 1) {
        let started = false;
        try {
          const stream = client.messages.stream(
            params,
            input.signal === undefined ? {} : { signal: input.signal },
          );
          const guard = new DeclineGuard();
          for await (const event of stream) {
            started = true;
            for (const released of guard.push(event)) yield { kind: 'delta', event: released };
          }
          for (const released of guard.flush()) yield { kind: 'delta', event: released };
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
