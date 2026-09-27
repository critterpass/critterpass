/**
 * OpenTelemetry for the worker: traces (outbound http, undici, pg), metrics (queue depth, job
 * outcomes, push, model spend) and pino logs over OTLP to Grafana Cloud (docs/system-architecture.md
 * §10). pg spans carry the statement shape only, never parameters.
 *
 * ESM instrumentation needs the import hook before any instrumented module loads, so production
 * starts through ./instrument.ts (`node --import <built instrument.js> <built index.js>`). Without
 * `OTEL_EXPORTER_OTLP_ENDPOINT` nothing starts. Credentials come from the standard
 * `OTEL_EXPORTER_OTLP_HEADERS` (a Railway variable), read by the exporters themselves.
 */
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, type LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader, type MetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';

/** Paths whose spans would only be noise (probes run every few seconds). */
const IGNORED_PATHS = new Set(['/health', '/favicon.ico']);

/** Query parameters whose values never reach a span: signatures plus OAuth codes and tokens. */
export const REDACTED_QUERY_PARAMS = [
  'sig',
  'Signature',
  'AWSAccessKeyId',
  'X-Goog-Signature',
  'X-Amz-Signature',
  'X-Amz-Credential',
  'X-Amz-Security-Token',
  'code',
  'state',
  'token',
  'id_token',
  'access_token',
  'seat',
  'otp',
];

export interface OtelOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly commit: string;
  /** OTLP base URL; unset (and no test exporter) = OpenTelemetry stays off. */
  readonly endpoint?: string | undefined;
  /** Tests: export spans synchronously to this exporter instead of OTLP. */
  readonly spanExporter?: SpanExporter;
  readonly metricReader?: MetricReader;
  readonly logProcessor?: LogRecordProcessor;
}

export interface Otel {
  shutdown(): Promise<void>;
}

export function startOtel(options: OtelOptions): Otel | undefined {
  if (!options.endpoint && !options.spanExporter) return undefined;
  // Stable HTTP semantic conventions: `http_server_request_duration_seconds` with
  // `http_response_status_code`, the names the Grafana dashboards and alerts query.
  process.env['OTEL_SEMCONV_STABILITY_OPT_IN'] ??= 'http';
  const base = options.endpoint?.replace(/\/$/u, '');
  const url = (signal: string) => (base ? { url: `${base}/v1/${signal}` } : {});
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': options.serviceName,
      'service.version': options.serviceVersion,
      'service.namespace': 'critterpass',
      'deployment.environment.name': options.environment,
      'vcs.ref.head.revision': options.commit,
    }),
    spanProcessors: [
      options.spanExporter
        ? new SimpleSpanProcessor(options.spanExporter)
        : new BatchSpanProcessor(new OTLPTraceExporter(url('traces'))),
    ],
    metricReaders: [
      options.metricReader ??
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(url('metrics')),
          exportIntervalMillis: 30_000,
        }),
    ],
    logRecordProcessors: [
      options.logProcessor ??
        new BatchLogRecordProcessor({ exporter: new OTLPLogExporter(url('logs')) }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => IGNORED_PATHS.has(request.url?.split('?')[0] ?? ''),
        redactedQueryParams: REDACTED_QUERY_PARAMS,
        redactedQueryParamsServer: REDACTED_QUERY_PARAMS,
      }),
      new UndiciInstrumentation(),
      new PgInstrumentation({ enhancedDatabaseReporting: false, requireParentSpan: true }),
      new PinoInstrumentation(),
    ],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
