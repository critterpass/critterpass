/**
 * LLM observability for the api's model calls, as one `Telemetry` the AI gateway takes: each
 * generation becomes a Langfuse trace (EU cloud, OTLP; `@cp/ai` telemetry) whose id lands in
 * `ai_usage.langfuse_trace_id`, a `cp_llm_cost_micros_total{feature,tier}` and
 * `cp_llm_latency_ms{feature,model}` point, and a PostHog `llm_call` event carrying the crew and
 * trip for per-trip cost (never as metric labels).
 *
 * Privacy: prompts and replies never leave (the gateway exports structured output only); that
 * output passes the privacy-registry key list and the shared scrubber, and any string field a
 * user wrote is replaced by its length. Answer ratings go to Langfuse as scores (`scoreTrace`).
 */
import {
  createLangfuseTelemetry,
  LANGFUSE_DEFAULT_HOST,
  type GenerationSpan,
  type Telemetry,
} from '@cp/ai';
import { maskUserText, redact, type AnalyticsEventProps } from '@cp/domain';

import { guideRedactionKeys } from '../ai/context';
import type { MetricsRecorder } from './metrics';

/** Keys whose string values are user-written text inside structured model output. */
const USER_TEXT_KEYS = new Set(['question', 'answer_text', 'user_text', 'draft', 'caption']);

export function maskOutput(output: unknown): unknown {
  const masked = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(masked);
    if (node === null || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        USER_TEXT_KEYS.has(key) && typeof value === 'string' ? maskUserText(value) : masked(value),
      ]),
    );
  };
  return masked(redact(output, { extraKeys: guideRedactionKeys() }));
}

export interface LlmObservabilityOptions {
  readonly publicKey: string | undefined;
  readonly secretKey: string | undefined;
  readonly host?: string | undefined;
  readonly environment: string;
  readonly metrics: MetricsRecorder;
  /** Sends the PostHog `llm_call` event (the server analytics `serverTrack`, subject-less). */
  readonly trackLlmCall: (props: AnalyticsEventProps<'llm_call'>) => void;
  readonly onError?: (error: unknown) => void;
  /** Network boundary override (tests). */
  readonly fetch?: typeof fetch;
  readonly flushIntervalMs?: number;
}

export interface LlmObservability extends Telemetry {
  scoreTrace(
    traceId: string,
    score: { name: string; value: number; comment?: string },
  ): Promise<void>;
}

export function createLlmObservability(options: LlmObservabilityOptions): LlmObservability {
  const langfuse = createLangfuseTelemetry({
    publicKey: options.publicKey,
    secretKey: options.secretKey,
    host: options.host,
    environment: options.environment,
    redactKeys: guideRedactionKeys(),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.flushIntervalMs === undefined ? {} : { flushIntervalMs: options.flushIntervalMs }),
    ...(options.onError ? { onError: options.onError } : {}),
  });
  const send = options.fetch ?? fetch;
  const scoresUrl = new URL('/api/public/scores', options.host || LANGFUSE_DEFAULT_HOST).toString();
  const authorization =
    options.publicKey && options.secretKey
      ? `Basic ${Buffer.from(`${options.publicKey}:${options.secretKey}`).toString('base64')}`
      : undefined;

  return {
    enabled: langfuse.enabled,
    recordGeneration(span: GenerationSpan) {
      const traceId = langfuse.recordGeneration(
        span.output === undefined ? span : { ...span, output: maskOutput(span.output) },
      );
      const latency = Math.max(0, span.endedAt.getTime() - span.startedAt.getTime());
      const model = span.model.toLowerCase();
      options.metrics.record('cp_llm_cost_micros_total', span.costMicros, {
        feature: span.route,
        tier: span.tier,
      });
      options.metrics.record('cp_llm_latency_ms', latency, { feature: span.route, model });
      options.trackLlmCall({
        feature: span.route,
        model,
        tier: span.tier,
        latency,
        cost_est: span.costMicros,
        ...(span.tripId ? { trip_id: span.tripId } : {}),
        ...(span.crewId ? { crew_id: span.crewId } : {}),
      });
      return traceId;
    },
    flush: () => langfuse.flush(),
    async scoreTrace(traceId, score) {
      if (authorization === undefined) return;
      try {
        const response = await send(scoresUrl, {
          method: 'POST',
          headers: { authorization, 'content-type': 'application/json' },
          body: JSON.stringify({
            traceId,
            name: score.name,
            value: score.value,
            dataType: 'NUMERIC',
            ...(score.comment ? { comment: maskUserText(score.comment) } : {}),
          }),
        });
        if (!response.ok) throw new Error(`langfuse score failed with HTTP ${response.status}`);
      } catch (error) {
        options.onError?.(error);
      }
    },
  };
}
