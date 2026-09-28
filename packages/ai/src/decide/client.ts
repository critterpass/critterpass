/**
 * `decide(route, {state, questions})`: the one entry point for typed decisions. It calls TypeSafe's
 * Jev at a pinned origin and model with an 800 ms budget per attempt and one retry on 429/529
 * (honouring a short `retry-after`), and falls back to the route's fast-tier twin on timeout, rate
 * limit or overload after the retry, transport error, an unreadable response or a missing key.
 * Every result says who answered (`answered_by`), and every call writes one usage record
 * (`tier='jev'`, input tokens only; or the twin's own fast-tier record through the gateway).
 *
 * Privacy: `state` carries only the text under question. Telemetry records route, model, token
 * counts, latency and the typed answers (labels and numbers), never the state.
 */
import type { DecisionAnswerer, DecisionRoute } from '@cp/domain';

import type { Gateway } from '../client';
import { GatewayConfigError, GatewayError } from '../errors';
import { computeCostMicros, type TokenUsage } from '../pricing';
import { JEV_MODEL, resolveRoute } from '../routing';
import type { Telemetry } from '../telemetry/langfuse';
import { buildUsageRecord, type AiUsageRecord, type UsageContext } from '../usage';
import { parseTwinAnswers, twinRequest } from './fallback';
import { answersSchema, validateQuestions, type Answers, type QuestionMap } from './questions';

/** Pinned: no environment variable or option can point decisions anywhere else. */
export const TYPESAFE_API_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_TIMEOUT_MS = 800;
/** A `retry-after` longer than this is not waited for: the twin answers instead. */
export const JEV_MAX_RETRY_WAIT_MS = 1_000;
const DEFAULT_RETRY_WAIT_MS = 200;

export type DecisionState = string | Readonly<Record<string, unknown>> | readonly unknown[];

export interface DecisionInput<Q extends QuestionMap> {
  readonly state: DecisionState;
  readonly questions: Q;
}

export type FallbackReason =
  | 'missing_key'
  | 'timeout'
  | 'rate_limited'
  | 'overloaded'
  | 'unauthorized'
  | 'provider_error'
  | 'transport_error'
  | 'invalid_response';

export interface Decision<Q extends QuestionMap> {
  readonly route: DecisionRoute;
  readonly answers: Answers<Q>;
  readonly answered_by: DecisionAnswerer;
  /** The model that answered (Jev's reported version, or the twin's DeepSeek model). */
  readonly model: string;
  /** Why the twin answered; `undefined` when Jev did. */
  readonly fallbackReason: FallbackReason | undefined;
  readonly latencyMs: number;
  readonly costMicros: number;
}

export interface DecisionClientOptions {
  /** `TYPESAFE_API_KEY`; unset = every decision answers from its fast-tier twin. */
  readonly apiKey?: string | undefined;
  /** The gateway that runs the fast-tier twins; without it a Jev failure is `AI_UNAVAILABLE`. */
  readonly gateway?: Pick<Gateway, 'callModel'>;
  readonly timeoutMs?: number;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
  readonly onUsage?: (record: AiUsageRecord) => Promise<void>;
  readonly onFallback?: (route: DecisionRoute, reason: FallbackReason) => void;
  readonly telemetry?: Telemetry;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
  /** Monotonic milliseconds for latency. */
  readonly clock?: () => number;
}

export interface DecisionClient {
  decide<Q extends QuestionMap>(
    route: DecisionRoute,
    input: DecisionInput<Q>,
    context?: UsageContext,
  ): Promise<Decision<Q>>;
}

/** Jev could not answer; the reason picks nothing but the log line and the fallback metric. */
class JevUnavailable extends Error {
  constructor(
    readonly reason: FallbackReason,
    readonly retryAfterMs?: number,
  ) {
    super(`jev unavailable: ${reason}`);
    this.name = 'JevUnavailable';
  }
}

interface JevResponse {
  readonly model?: unknown;
  readonly answers?: unknown;
  readonly usage?: { readonly input_tokens?: unknown; readonly output_tokens?: unknown };
}

function retryAfterMs(headers: Headers): number | undefined {
  const header = headers.get('retry-after');
  const seconds = header === null ? Number.NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function reasonFor(status: number): FallbackReason {
  if (status === 429) return 'rate_limited';
  if (status === 529) return 'overloaded';
  if (status === 401 || status === 403) return 'unauthorized';
  return 'provider_error';
}

function tokenUsage(inputTokens: number, outputTokens: number): TokenUsage {
  return {
    inputTokens,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens,
  };
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

export function createDecisionClient(options: DecisionClientOptions = {}): DecisionClient {
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? JEV_TIMEOUT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? (() => performance.now());

  async function attempt(body: string, apiKey: string): Promise<JevResponse> {
    let response: Response;
    const isTimeout = (error: unknown) =>
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    try {
      response = await send(TYPESAFE_API_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new JevUnavailable(isTimeout(error) ? 'timeout' : 'transport_error');
    }
    if (response.status === 400 || response.status === 422) {
      // A request Jev refuses as malformed is a programming error, not an outage.
      throw new GatewayConfigError(`jev rejected the request with HTTP ${response.status}`);
    }
    if (!response.ok) {
      throw new JevUnavailable(reasonFor(response.status), retryAfterMs(response.headers));
    }
    try {
      return (await response.json()) as JevResponse;
    } catch (error) {
      throw new JevUnavailable(isTimeout(error) ? 'timeout' : 'invalid_response');
    }
  }

  async function callJev(body: string, apiKey: string): Promise<JevResponse> {
    try {
      return await attempt(body, apiKey);
    } catch (error) {
      const status = error instanceof JevUnavailable ? error.reason : undefined;
      const retryable = status === 'rate_limited' || status === 'overloaded';
      if (!retryable) throw error;
      const wait = (error as JevUnavailable).retryAfterMs ?? DEFAULT_RETRY_WAIT_MS;
      if (wait > JEV_MAX_RETRY_WAIT_MS) throw error;
      await sleep(wait);
      return attempt(body, apiKey);
    }
  }

  async function answerWithJev<Q extends QuestionMap>(
    route: DecisionRoute,
    input: DecisionInput<Q>,
    apiKey: string,
    context: UsageContext,
    startedAt: Date,
    started: number,
  ): Promise<Decision<Q>> {
    const body = JSON.stringify({
      state: input.state,
      model: JEV_MODEL,
      questions: input.questions,
    });
    const response = await callJev(body, apiKey);
    const parsed = answersSchema(input.questions).safeParse(response.answers);
    if (!parsed.success) throw new JevUnavailable('invalid_response');
    const model = typeof response.model === 'string' ? response.model : JEV_MODEL;
    const usage = tokenUsage(
      count(response.usage?.input_tokens),
      count(response.usage?.output_tokens),
    );
    const endedAt = now();
    const costMicros = computeCostMicros('jev', usage, endedAt);
    const traceId =
      context.langfuseTraceId ??
      options.telemetry?.recordGeneration({
        route,
        model,
        tier: 'jev',
        usage,
        costMicros,
        startedAt,
        endedAt,
        stopReason: null,
        userId: context.userId ?? null,
        tripId: context.tripId ?? null,
        crewId: context.crewId ?? null,
        jobId: context.jobId ?? null,
        output: parsed.data,
      }) ??
      null;
    await options.onUsage?.(
      buildUsageRecord({
        route,
        model,
        tier: 'jev',
        usage,
        costMicros,
        context: { ...context, langfuseTraceId: traceId },
        at: endedAt,
      }),
    );
    return {
      route,
      answers: parsed.data,
      answered_by: 'jev',
      model,
      fallbackReason: undefined,
      latencyMs: clock() - started,
      costMicros,
    };
  }

  async function answerWithTwin<Q extends QuestionMap>(
    route: DecisionRoute,
    input: DecisionInput<Q>,
    reason: FallbackReason,
    context: UsageContext,
    started: number,
  ): Promise<Decision<Q>> {
    options.onFallback?.(route, reason);
    if (options.gateway === undefined) {
      throw new GatewayError('AI_UNAVAILABLE', 'decision model unavailable and no fallback', {
        detail: { route, reason },
      });
    }
    const result = await options.gateway.callModel(
      route,
      twinRequest(input.state, input.questions),
      context,
    );
    return {
      route,
      answers: parseTwinAnswers(input.questions, result.message),
      answered_by: 'fast',
      model: result.route.model,
      fallbackReason: reason,
      latencyMs: clock() - started,
      costMicros: result.costMicros,
    };
  }

  return {
    async decide(route, input, context = {}) {
      const config = resolveRoute(route);
      if (config.provider !== 'jev') {
        throw new GatewayConfigError(`route ${route} is not a decision route`);
      }
      validateQuestions(input.questions);
      const started = clock();
      if (options.apiKey === undefined || options.apiKey === '') {
        return answerWithTwin(route, input, 'missing_key', context, started);
      }
      try {
        return await answerWithJev(route, input, options.apiKey, context, now(), started);
      } catch (error) {
        if (!(error instanceof JevUnavailable)) throw error;
        return answerWithTwin(route, input, error.reason, context, started);
      }
    },
  };
}
