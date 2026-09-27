/**
 * W3C trace context across the job boundary: `traceCarrier()` captures the active context (the
 * app's `traceparent` continued by the http instrumentation) so a job enqueued in this request can
 * carry it in its metadata and the worker can continue the same trace.
 */
import { context, propagation } from '@opentelemetry/api';

export interface TraceCarrier {
  traceparent?: string;
  tracestate?: string;
}

export function traceCarrier(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}
