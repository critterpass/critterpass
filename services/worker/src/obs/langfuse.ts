/**
 * LLM observability for the worker's model calls (agent jobs, batch steps, compliance checks):
 * the same contract as the api's helper. Each generation is a Langfuse trace with masked
 * structured output, a `cp_llm_cost_micros_total{feature,tier}` and `cp_llm_latency_ms` point, and
 * a PostHog `llm_call` event (about no person: per-event id, no profile) with the crew and trip.
 */
import { randomUUID } from 'node:crypto';

import { createLangfuseTelemetry, type GenerationSpan, type Telemetry } from '@cp/ai';
import { guardAnalyticsEvent, maskUserText, redact } from '@cp/domain';

import type { AnalyticsSink } from '../analytics-export';
import { privacyRedactionKeys } from './logger';
import type { MetricsRecorder } from './metrics';

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
  return masked(redact(output, { extraKeys: privacyRedactionKeys() }));
}

export interface WorkerLlmObservabilityOptions {
  readonly publicKey: string | undefined;
  readonly secretKey: string | undefined;
  readonly host?: string | undefined;
  readonly environment: string;
  readonly metrics: MetricsRecorder;
  /** PostHog sink for `llm_call`; absent = no product event. */
  readonly sink?: AnalyticsSink;
  readonly onError?: (error: unknown) => void;
  readonly fetch?: typeof fetch;
  readonly flushIntervalMs?: number;
}

export function createWorkerLlmObservability(options: WorkerLlmObservabilityOptions): Telemetry {
  const langfuse = createLangfuseTelemetry({
    publicKey: options.publicKey,
    secretKey: options.secretKey,
    host: options.host,
    environment: options.environment,
    redactKeys: privacyRedactionKeys(),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.flushIntervalMs === undefined ? {} : { flushIntervalMs: options.flushIntervalMs }),
    ...(options.onError ? { onError: options.onError } : {}),
  });

  const track = (span: GenerationSpan, latency: number, model: string) => {
    if (!options.sink) return;
    const guarded = guardAnalyticsEvent('llm_call', {
      feature: span.route,
      model,
      tier: span.tier,
      latency,
      cost_est: span.costMicros,
      platform: 'server',
      ...(span.tripId ? { trip_id: span.tripId } : {}),
      ...(span.crewId ? { crew_id: span.crewId } : {}),
    });
    if (!guarded.ok) return;
    const uuid = randomUUID();
    options.sink
      .send([
        {
          event: 'llm_call',
          uuid,
          distinct_id: `srv_${uuid}`,
          timestamp: span.endedAt.toISOString(),
          properties: { ...guarded.properties, $process_person_profile: false },
        },
      ])
      .catch((error: unknown) => options.onError?.(error));
  };

  return {
    enabled: langfuse.enabled,
    recordGeneration(span) {
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
      track(span, latency, model);
      return traceId;
    },
    flush: () => langfuse.flush(),
  };
}
