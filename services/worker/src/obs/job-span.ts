/**
 * One consumer span per job attempt, named after the queue, so the attempt's pg queries nest under
 * it (the pg instrumentation records a query only under a parent span). A job whose payload
 * carries the enqueuing request's trace context (`_trace`) continues that trace; any other job
 * starts a new trace. Attributes are the queue and the attempt number only: no job, user, crew or
 * trip ids and no payload data. A failed attempt ends the span with an error status.
 */
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

import { runInTrace, type TraceCarrier } from './trace-context';

const tracer = trace.getTracer('@cp/worker');

/** The trace context a payload carries under `_trace`, if it carries a valid-looking one. */
export function jobTraceCarrier(data: unknown): TraceCarrier | undefined {
  if (typeof data !== 'object' || data === null || !('_trace' in data)) return undefined;
  const carrier = data._trace;
  if (typeof carrier !== 'object' || carrier === null) return undefined;
  const { traceparent, tracestate } = carrier as Record<string, unknown>;
  if (typeof traceparent !== 'string') return undefined;
  return typeof tracestate === 'string' ? { traceparent, tracestate } : { traceparent };
}

export function withJobSpan<T>(
  job: { readonly queue: string; readonly attempt: number },
  carrier: TraceCarrier | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return runInTrace(carrier, () =>
    tracer.startActiveSpan(
      job.queue,
      {
        kind: SpanKind.CONSUMER,
        root: carrier === undefined,
        attributes: { 'messaging.destination.name': job.queue, 'job.attempt': job.attempt },
      },
      async (span) => {
        try {
          return await fn();
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    ),
  );
}
