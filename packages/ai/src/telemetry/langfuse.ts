/**
 * Langfuse traces for model calls (docs/system-architecture.md §10 observability) over OTLP/HTTP
 * JSON: one `generation` span per call with its route, model, token usage, cost and the crew/trip
 * it is billed to, posted in batches to `<LANGFUSE_HOST>/api/public/otel/v1/traces`.
 *
 * Privacy: prompt and reply text are never exported. The only content that leaves is structured
 * output (tool calls, JSON answers), and it passes through the redaction list first (the columns
 * the privacy registry classes C3/C4, ../context/redact.ts). Ids are pseudonymous uuids.
 *
 * Without `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` this is a no-op: nothing is buffered or
 * sent and calls carry no trace id. Export failures are reported to `onError`, never thrown.
 */
import { randomBytes } from 'node:crypto';

import type { AiRoute, AiTier } from '@cp/domain';

import { redactRecord } from '../context/redact';
import type { TokenUsage } from '../pricing';

export const LANGFUSE_DEFAULT_HOST = 'https://cloud.langfuse.com';
const TRACES_PATH = '/api/public/otel/v1/traces';

export interface GenerationSpan {
  readonly route: AiRoute;
  readonly model: string;
  readonly tier: AiTier;
  readonly usage: TokenUsage;
  readonly costMicros: number;
  readonly batch?: boolean;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly stopReason: string | null;
  readonly userId?: string | null;
  readonly tripId?: string | null;
  readonly crewId?: string | null;
  readonly jobId?: string | null;
  /** Structured output only (tool calls, JSON answers); redacted before export. */
  readonly output?: unknown;
}

export interface Telemetry {
  readonly enabled: boolean;
  /** Queues one span; returns its trace id (null when telemetry is off). */
  recordGeneration(span: GenerationSpan): string | null;
  /** Sends everything queued so far. */
  flush(): Promise<void>;
}

export const NOOP_TELEMETRY: Telemetry = {
  enabled: false,
  recordGeneration: () => null,
  flush: () => Promise.resolve(),
};

export interface LangfuseOptions {
  readonly publicKey?: string | undefined;
  readonly secretKey?: string | undefined;
  readonly host?: string | undefined;
  /** Keys dropped from exported structured output (redactionKeys over the privacy registry). */
  readonly redactKeys?: readonly string[];
  readonly environment?: string;
  readonly fetch?: typeof fetch;
  readonly batchSize?: number;
  /** 0 = only explicit `flush()` calls send (tests). */
  readonly flushIntervalMs?: number;
  readonly onError?: (error: unknown) => void;
}

type AttributeValue =
  | { readonly stringValue: string }
  | { readonly intValue: string }
  | { readonly doubleValue: number }
  | { readonly arrayValue: { readonly values: readonly { readonly stringValue: string }[] } };

interface Attribute {
  readonly key: string;
  readonly value: AttributeValue;
}

const hex = (bytes: number) => randomBytes(bytes).toString('hex');
const nanos = (date: Date) => `${BigInt(date.getTime()) * 1_000_000n}`;
const str = (key: string, value: string): Attribute => ({ key, value: { stringValue: value } });
const int = (key: string, value: number): Attribute => ({ key, value: { intValue: `${value}` } });

function attributesOf(span: GenerationSpan, redactKeys: readonly string[]): Attribute[] {
  const { usage } = span;
  const tags = [
    `route:${span.route}`,
    `tier:${span.tier}`,
    ...(span.tripId ? [`trip:${span.tripId}`] : []),
    ...(span.crewId ? [`crew:${span.crewId}`] : []),
    ...(span.batch === true ? ['batch'] : []),
  ];
  const attributes: Attribute[] = [
    str('langfuse.observation.type', 'generation'),
    str('langfuse.trace.name', span.route),
    str('langfuse.observation.model.name', span.model),
    str('gen_ai.request.model', span.model),
    str(
      'langfuse.observation.usage_details',
      JSON.stringify({
        input: usage.inputTokens,
        output: usage.outputTokens,
        cache_read_input_tokens: usage.cacheReadTokens,
        cache_creation_input_tokens: usage.cacheWriteTokens,
      }),
    ),
    str(
      'langfuse.observation.cost_details',
      JSON.stringify({ total: span.costMicros / 1_000_000 }),
    ),
    {
      key: 'langfuse.trace.tags',
      value: { arrayValue: { values: tags.map((t) => ({ stringValue: t })) } },
    },
    int('langfuse.trace.metadata.cost_micros', span.costMicros),
    str('langfuse.observation.metadata.stop_reason', span.stopReason ?? 'none'),
  ];
  if (span.userId) attributes.push(str('langfuse.user.id', span.userId));
  if (span.tripId) {
    attributes.push(str('langfuse.session.id', span.tripId));
    attributes.push(str('langfuse.trace.metadata.trip_id', span.tripId));
  }
  if (span.crewId) attributes.push(str('langfuse.trace.metadata.crew_id', span.crewId));
  if (span.jobId) attributes.push(str('langfuse.trace.metadata.job_id', span.jobId));
  if (span.output !== undefined) {
    const output = JSON.stringify(redactRecord(span.output, redactKeys));
    attributes.push(str('langfuse.observation.output', output));
  }
  return attributes;
}

export function createLangfuseTelemetry(options: LangfuseOptions): Telemetry {
  const { publicKey, secretKey } = options;
  if (!publicKey || !secretKey) return NOOP_TELEMETRY;
  const endpoint = new URL(TRACES_PATH, options.host || LANGFUSE_DEFAULT_HOST).toString();
  const authorization = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
  const send = options.fetch ?? fetch;
  const batchSize = options.batchSize ?? 50;
  const redactKeys = options.redactKeys ?? [];
  const resource = {
    attributes: [
      str('service.name', 'critterpass-ai'),
      str('deployment.environment', options.environment ?? 'local'),
    ],
  };
  let pending: object[] = [];

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    const spans = pending;
    pending = [];
    const body = {
      resourceSpans: [{ resource, scopeSpans: [{ scope: { name: '@cp/ai' }, spans }] }],
    };
    try {
      const response = await send(endpoint, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`langfuse export failed with HTTP ${response.status}`);
    } catch (error) {
      options.onError?.(error);
    }
  };

  const interval = options.flushIntervalMs ?? 5_000;
  if (interval > 0) setInterval(() => void flush(), interval).unref();

  return {
    enabled: true,
    recordGeneration(span) {
      const traceId = hex(16);
      pending.push({
        traceId,
        spanId: hex(8),
        name: span.route,
        kind: 3,
        startTimeUnixNano: nanos(span.startedAt),
        endTimeUnixNano: nanos(span.endedAt),
        attributes: attributesOf(span, redactKeys),
        status: { code: span.stopReason === 'refusal' ? 2 : 1 },
      });
      if (pending.length >= batchSize) void flush();
      return traceId;
    },
    flush,
  };
}
