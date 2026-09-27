/**
 * The api's pino logger: structured JSON with `service` and `commit`, and `redact.paths` built
 * from the base sensitive keys plus every C3/C4 column in the privacy registry (the same list
 * the guide's context builder strips). The OpenTelemetry pino instrumentation adds trace ids and
 * forwards records as OTLP logs; `req_id`, `op_id` and the hashed `uid` come from call sites.
 */
import { BASE_LOG_REDACT_KEYS, redactPaths } from '@cp/domain';
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

import { guideRedactionKeys } from '../ai/context';

export function logRedactPaths(): string[] {
  return redactPaths([...new Set([...BASE_LOG_REDACT_KEYS, ...guideRedactionKeys()])]);
}

export function createLogger(options: {
  readonly level: LoggerOptions['level'];
  readonly service: string;
  readonly commit: string;
  readonly destination?: DestinationStream;
}): Logger {
  const config: LoggerOptions = {
    level: options.level ?? 'info',
    base: { service: options.service, commit: options.commit },
    redact: { paths: logRedactPaths(), censor: '[redacted]' },
  };
  return options.destination ? pino(config, options.destination) : pino(config);
}
