/**
 * How a service's health is measured. Every api and worker process meters its outbound HTTP calls
 * (Node's fetch publishes each request on `diagnostics_channel`): per vendor and minute it counts
 * calls and errors in Redis and keeps the latencies. The worker's health collector reads the last
 * ten minutes, judges the state with `judgeCalls` and writes a snapshot. Nothing here touches Redis
 * or the network: callers pass the channel subscriber and the sink.
 */
import { SERVICES } from './service-list';
import type { ServiceState } from './services-registry';

/** Minutes of call counters a health snapshot reads. */
export const CALL_WINDOW_MINUTES = 10;
/** Counter keys outlive the window so a slow tick still reads it whole. */
export const CALL_KEY_TTL_SECONDS = 20 * 60;
/** Latency samples kept per service and minute. */
export const CALL_LATENCY_SAMPLES = 200;
/** Above this error share a service is degraded. */
export const DEGRADED_ERROR_RATE = 0.02;
/** At or above this share (with enough calls) it is down. */
export const DOWN_ERROR_RATE = 0.5;
export const DOWN_MIN_CALLS = 3;

export const callCountKey = (service: string, minute: number) => `ops:calls:${service}:${minute}`;
export const callLatencyKey = (service: string, minute: number) =>
  `ops:latency:${service}:${minute}`;
/** The hourly usage poller's quota reading (JSON `{pct, at}`), read by the health collector. */
export const quotaKey = (service: string) => `ops:quota:${service}`;

export const epochMinute = (at: Date) => Math.floor(at.getTime() / 60_000);

const hostIndex = new Map<string, string>(
  SERVICES.flatMap((entry) => (entry.hosts ?? []).map((host) => [host, entry.key] as const)),
);

/** The service a request origin belongs to, or null for our own and unlisted hosts. */
export function serviceForOrigin(origin: string): string | null {
  try {
    return hostIndex.get(new URL(origin).hostname) ?? null;
  } catch {
    return null;
  }
}

/** A vendor answer that says the vendor is unwell: 5xx and rate limiting. Our own 4xx are not. */
export const isVendorError = (status: number | null) =>
  status === null || status >= 500 || status === 429;

export interface CallMinute {
  readonly calls: number;
  readonly errors: number;
  readonly latencies: readonly number[];
}

export interface CallJudgement {
  readonly state: ServiceState;
  readonly calls: number;
  readonly error_rate: number;
  readonly p95_ms: number | null;
}

export function p95(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null;
}

/**
 * The state the last minutes of calls show: no calls is no evidence (null, so the row keeps its
 * last state until it goes stale); degraded when the error share passes 2 % or the p95 is over
 * twice the service's own baseline; down when most of several calls failed.
 */
export function judgeCalls(
  minutes: readonly CallMinute[],
  baselineP95: number | null,
): CallJudgement | null {
  const calls = minutes.reduce((total, minute) => total + minute.calls, 0);
  if (calls === 0) return null;
  const errors = minutes.reduce((total, minute) => total + minute.errors, 0);
  const errorRate = errors / calls;
  const p95Ms = p95(minutes.flatMap((minute) => minute.latencies));
  const slow = baselineP95 !== null && p95Ms !== null && p95Ms > baselineP95 * 2;
  const state: ServiceState =
    calls >= DOWN_MIN_CALLS && errorRate >= DOWN_ERROR_RATE
      ? 'down'
      : errorRate > DEGRADED_ERROR_RATE || slow
        ? 'degraded'
        : 'ok';
  return { state, calls, error_rate: errorRate, p95_ms: p95Ms };
}

const SEVERITY: Readonly<Record<ServiceState, number>> = {
  ok: 0,
  unknown: 1,
  degraded: 2,
  down: 3,
};

/** A hosting platform's state: the worst of what it hosts; unknown only when nothing is known. */
export function worstState(states: readonly ServiceState[]): ServiceState {
  const known = states.filter((state) => state !== 'unknown');
  if (known.length === 0) return 'unknown';
  return known.reduce((worst, state) => (SEVERITY[state] > SEVERITY[worst] ? state : worst));
}

/** A Statuspage `status.indicator` as a state. */
export function statuspageState(indicator: unknown): ServiceState {
  if (indicator === 'none') return 'ok';
  if (indicator === 'minor' || indicator === 'major' || indicator === 'maintenance') {
    return 'degraded';
  }
  if (indicator === 'critical') return 'down';
  return 'unknown';
}

export type CallSink = (service: string, ms: number, ok: boolean) => void;

interface UndiciRequest {
  readonly origin?: unknown;
}
type Subscribe = (name: string, listener: (message: unknown) => void) => void;

/**
 * Meters every outbound fetch to a listed vendor through undici's diagnostics channels (pass
 * `diagnostics_channel.subscribe`). Latency is the time to the response headers.
 */
export function meterVendorCalls(subscribe: Subscribe, sink: CallSink): void {
  const started = new WeakMap<object, { service: string; at: number }>();
  const requestOf = (message: unknown) =>
    (message as { request?: UndiciRequest & object } | null)?.request;
  subscribe('undici:request:create', (message) => {
    const request = requestOf(message);
    if (request === undefined || typeof request.origin !== 'string') return;
    const service = serviceForOrigin(request.origin);
    if (service !== null) started.set(request, { service, at: performance.now() });
  });
  subscribe('undici:request:headers', (message) => {
    const request = requestOf(message);
    const start = request === undefined ? undefined : started.get(request);
    if (request === undefined || start === undefined) return;
    started.delete(request);
    const status = (message as { response?: { statusCode?: unknown } }).response?.statusCode;
    sink(
      start.service,
      performance.now() - start.at,
      !isVendorError(typeof status === 'number' ? status : null),
    );
  });
  subscribe('undici:request:error', (message) => {
    const request = requestOf(message);
    const start = request === undefined ? undefined : started.get(request);
    if (request === undefined || start === undefined) return;
    started.delete(request);
    sink(start.service, performance.now() - start.at, false);
  });
}

export interface CallCounterRedis {
  multi(): {
    hIncrBy(key: string, field: string, by: number): unknown;
    rPush(key: string, value: string): unknown;
    lTrim(key: string, start: number, stop: number): unknown;
    expire(key: string, seconds: number): unknown;
    exec(): Promise<unknown>;
  };
}

/** The Redis sink both services pass to `meterVendorCalls`; a failed write is dropped. */
export function redisCallSink(
  redis: CallCounterRedis,
  onError?: (error: unknown) => void,
): CallSink {
  return (service, ms, ok) => {
    const minute = epochMinute(new Date());
    const counts = callCountKey(service, minute);
    const latency = callLatencyKey(service, minute);
    const batch = redis.multi();
    batch.hIncrBy(counts, 'calls', 1);
    batch.hIncrBy(counts, 'errors', ok ? 0 : 1);
    batch.expire(counts, CALL_KEY_TTL_SECONDS);
    batch.rPush(latency, String(Math.round(ms)));
    batch.lTrim(latency, -CALL_LATENCY_SAMPLES, -1);
    batch.expire(latency, CALL_KEY_TTL_SECONDS);
    batch.exec().catch((error: unknown) => onError?.(error));
  };
}
