/**
 * W3C trace context across the job boundary: a job whose metadata carries the enqueuing request's
 * `traceparent` runs inside that trace (`runInTrace`), so api → job → pg reads as one trace.
 */
import { context, propagation } from '@opentelemetry/api';

export interface TraceCarrier {
  traceparent?: string;
  tracestate?: string;
}

export function runInTrace<T>(carrier: TraceCarrier | undefined, fn: () => T): T {
  if (!carrier?.traceparent) return fn();
  return context.with(propagation.extract(context.active(), carrier), fn);
}
