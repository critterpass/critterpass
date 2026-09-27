/**
 * The worker's pino logger: structured JSON with `service` and `commit`, and `redact.paths` built
 * from the base sensitive keys plus every C3/C4 column in the privacy registry. Job payloads are
 * never logged whole (boss/dlq.ts); this is the backstop for fields that slip into a log call.
 */
import { redactionKeys, type PrivacyTableColumns } from '@cp/ai';
import { schema } from '@cp/db';
import { BASE_LOG_REDACT_KEYS, getTablePrivacy, redactPaths } from '@cp/domain';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

function privacyTableColumns(): PrivacyTableColumns[] {
  const tables: PrivacyTableColumns[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const table: PgTable = value;
    const privacy = getTablePrivacy(getTableName(table));
    if (privacy === undefined) continue;
    tables.push({
      table: getTableName(table),
      privacyClass: privacy.class,
      columns: Object.values(getTableColumns(table)).map((column) => column.name),
      ...(privacy.columns === undefined ? {} : { columnClasses: privacy.columns }),
    });
  }
  return tables;
}

let registryKeys: readonly string[] | undefined;

/** Every C3/C4 column name in the privacy registry (the same list the guide context strips). */
export function privacyRedactionKeys(): readonly string[] {
  registryKeys ??= redactionKeys(privacyTableColumns());
  return registryKeys;
}

export function logRedactPaths(): string[] {
  return redactPaths([...new Set([...BASE_LOG_REDACT_KEYS, ...privacyRedactionKeys()])]);
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
