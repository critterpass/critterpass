import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { describe, expect, it } from 'vitest';

import { createMetricsRecorder } from '../../src/obs/metrics';
import { REDACTED_QUERY_PARAMS } from '../../src/obs/otel';

function harness(strict = false) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
  const provider = new MeterProvider({ readers: [reader] });
  const recorder = createMetricsRecorder({ meter: provider.getMeter('test'), strict });
  const exported = async () => {
    await reader.forceFlush();
    return exporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
      .map((metric) => ({
        name: metric.descriptor.name,
        unit: metric.descriptor.unit,
        points: metric.dataPoints.map((point) => ({
          attributes: point.attributes,
          value: point.value,
        })),
      }));
  };
  return { recorder, exported };
}

describe('otel metrics', () => {
  it('records catalog metrics with their units and allowed labels', async () => {
    const { recorder, exported } = harness(true);
    recorder.recordCommand('cast_ballot', 'applied', 'ok', 42);
    recorder.record('cp_job_queue_depth', 7, { queue: 'push.send' });
    const metrics = await exported();
    expect(metrics.find((metric) => metric.name === 'cp_cmd_total')).toMatchObject({
      unit: '{command}',
      points: [{ attributes: { cmd: 'cast_ballot', code: 'ok' }, value: 1 }],
    });
    expect(metrics.find((metric) => metric.name === 'cp_cmd_duration_ms')?.unit).toBe('ms');
    expect(metrics.find((metric) => metric.name === 'cp_job_queue_depth')).toMatchObject({
      points: [{ attributes: { queue: 'push.send' }, value: 7 }],
    });
  });

  it('refuses labels outside the allow-list', async () => {
    const strict = harness(true);
    expect(() =>
      strict.recorder.record('cp_job_total', 1, {
        queue: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
        outcome: 'ok',
      }),
    ).toThrow(/low-cardinality/u);

    const lenient = harness(false);
    lenient.recorder.record('cp_cmd_total', 1, { cmd: 'x', code: 'ok', trip_id: 'abc' } as never);
    const metrics = await lenient.exported();
    expect(metrics.some((metric) => metric.name === 'cp_cmd_total')).toBe(false);
    expect(metrics.find((metric) => metric.name === 'cp_metric_rejected_total')).toMatchObject({
      points: [{ attributes: { metric: 'cp_cmd_total' }, value: 1 }],
    });
  });

  it('redacts OAuth codes and signatures from span URLs', () => {
    expect(REDACTED_QUERY_PARAMS).toEqual(
      expect.arrayContaining(['sig', 'code', 'state', 'token']),
    );
  });
});
