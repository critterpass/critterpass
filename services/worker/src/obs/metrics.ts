/**
 * Typed recording of the catalog metrics (`@cp/domain` obs): each name maps to one instrument of
 * its declared kind and unit, and every call's labels pass the allow-list check first. A label
 * set that fails is dropped and counted on `cp_metric_rejected_total{metric}` (and throws in
 * tests and local runs), so a high-cardinality label can never reach Grafana.
 */
import { checkMetricLabels, METRICS, type MetricLabels, type MetricName } from '@cp/domain';
import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';

export interface MetricsRecorder {
  record<N extends MetricName>(name: N, value: number, labels: MetricLabels<N>): void;
  /** One handled command: duration by outcome and a count by wire code (`ok` when applied). */
  recordCommand(
    cmd: string,
    outcome: 'applied' | 'duplicate' | 'rejected',
    code: string,
    ms: number,
  ): void;
}

export interface MetricsOptions {
  readonly meter?: Meter;
  /** Throw on a rejected label set instead of dropping it (tests, local). */
  readonly strict?: boolean;
}

interface GaugeSetter {
  record(value: number, labels: Record<string, string>): void;
}
type Instrument = Counter | Histogram | GaugeSetter;

export function createMetricsRecorder(options: MetricsOptions = {}): MetricsRecorder {
  const meter = options.meter ?? metrics.getMeter('critterpass');
  const instruments = new Map<MetricName, Instrument>();
  const rejected = meter.createCounter('cp_metric_rejected_total', {
    description: 'Metric points dropped for failing the label allow-list',
  });
  const gauges = new Map<string, number>();

  const instrument = (name: MetricName): Instrument => {
    const existing = instruments.get(name);
    if (existing) return existing;
    const { kind, unit, description } = METRICS[name];
    let created: Instrument;
    if (kind === 'counter') created = meter.createCounter(name, { unit, description });
    else if (kind === 'histogram') created = meter.createHistogram(name, { unit, description });
    else {
      const gauge = meter.createObservableGauge(name, { unit, description });
      gauge.addCallback((result) => {
        for (const [key, value] of gauges) {
          if (key.startsWith(`${name}|`)) {
            result.observe(value, JSON.parse(key.slice(name.length + 1)) as Record<string, string>);
          }
        }
      });
      const setter: GaugeSetter = {
        record: (value, labels) => {
          gauges.set(`${name}|${JSON.stringify(labels)}`, value);
        },
      };
      created = setter;
    }
    instruments.set(name, created);
    return created;
  };

  const record = <N extends MetricName>(name: N, value: number, labels: MetricLabels<N>) => {
    const check = checkMetricLabels(name, labels);
    if (!check.ok) {
      if (options.strict) throw new Error(`metric ${name}: ${check.reason}`);
      rejected.add(1, { metric: name });
      return;
    }
    const target = instrument(name);
    if ('add' in target) target.add(value, labels);
    else target.record(value, labels);
  };

  return {
    record,
    recordCommand(cmd, outcome, code, ms) {
      record('cp_cmd_duration_ms', ms, { cmd, outcome });
      record('cp_cmd_total', 1, { cmd, code });
    },
  };
}
