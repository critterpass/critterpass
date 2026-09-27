/**
 * The platform metric catalog: every custom OpenTelemetry metric the services emit, with its
 * instrument, unit and the only label keys it may carry. Labels are low-cardinality enums (a
 * command name, an outcome, a queue); user, crew and trip ids never become labels. Per-trip cost
 * lives in PostHog `llm_call` and Langfuse instead. Owning phases emit these by name.
 */
export type MetricKind = 'counter' | 'histogram' | 'gauge';

export interface MetricDefinition {
  readonly kind: MetricKind;
  readonly unit: string;
  readonly description: string;
  readonly labels: readonly string[];
}

export const METRICS = {
  cp_cmd_duration_ms: {
    kind: 'histogram',
    unit: 'ms',
    description: 'Command handling time, door to outcome',
    labels: ['cmd', 'outcome'],
  },
  cp_cmd_total: {
    kind: 'counter',
    unit: '1',
    description: 'Commands handled, by wire error code (ok when applied)',
    labels: ['cmd', 'code'],
  },
  cp_sync_upload_total: {
    kind: 'counter',
    unit: '1',
    description: 'PowerSync upload operations by outcome',
    labels: ['outcome'],
  },
  cp_rt_publish_total: {
    kind: 'counter',
    unit: '1',
    description: 'Realtime publications by channel namespace',
    labels: ['ns'],
  },
  cp_rt_unsubscribe_ms: {
    kind: 'histogram',
    unit: 'ms',
    description: 'Membership removal to realtime unsubscribe',
    labels: [],
  },
  cp_job_total: {
    kind: 'counter',
    unit: '1',
    description: 'Jobs finished by queue and outcome',
    labels: ['queue', 'outcome'],
  },
  cp_job_queue_depth: {
    kind: 'gauge',
    unit: '1',
    description: 'Jobs waiting per queue',
    labels: ['queue'],
  },
  cp_push_total: {
    kind: 'counter',
    unit: '1',
    description: 'Push sends by provider, category and outcome',
    labels: ['provider', 'category', 'outcome'],
  },
  cp_llm_cost_micros_total: {
    kind: 'counter',
    unit: 'usd_micros',
    description: 'Model spend in USD micros by feature and tier',
    labels: ['feature', 'tier'],
  },
  cp_llm_latency_ms: {
    kind: 'histogram',
    unit: 'ms',
    description: 'Model call latency by feature and model',
    labels: ['feature', 'model'],
  },
  cp_supplier_call_ms: {
    kind: 'histogram',
    unit: 'ms',
    description: 'Supplier adapter call time',
    labels: ['adapter', 'op', 'outcome'],
  },
  cp_sms_sent_total: {
    kind: 'counter',
    unit: '1',
    description: 'OTP and fallback SMS sent by provider and destination country',
    labels: ['provider', 'country'],
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricName = keyof typeof METRICS;
export type MetricLabels<N extends MetricName> = {
  readonly [K in (typeof METRICS)[N]['labels'][number]]: string;
};

/** A label value: a short lower-case token. UUIDs and anything free-form are refused. */
const LABEL_VALUE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/u;
const UUID_LIKE = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/iu;

export type LabelCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Checks labels against the metric's allow-list and value shape. */
export function checkMetricLabels(
  name: MetricName,
  labels: Readonly<Record<string, string>>,
): LabelCheck {
  const allowed: readonly string[] = METRICS[name].labels;
  for (const key of allowed) {
    if (!(key in labels)) return { ok: false, reason: `missing label ${key}` };
  }
  for (const [key, value] of Object.entries(labels)) {
    if (!allowed.includes(key)) return { ok: false, reason: `label ${key} not allowed` };
    if (!LABEL_VALUE.test(value) || UUID_LIKE.test(value)) {
      return { ok: false, reason: `label ${key} value is not a low-cardinality token` };
    }
  }
  return { ok: true };
}
