/**
 * Binds the gateway's context builder to Postgres: every read runs in a `guide_reader` transaction
 * scoped to the asking user and trip (`withGuideReader`), and the redaction list is generated from
 * the privacy registry over the real Drizzle schema, so a C3 table added later joins it without an
 * edit here. The same list is what pino's `redact.paths` should use (`pinoRedactPaths`).
 */
import {
  buildContext,
  redactionKeys,
  type BuildContextInput,
  type GuideContext,
  type PrivacyTableColumns,
  type RunAsGuideReader,
} from '@cp/ai';
import { schema, withGuideReader } from '@cp/db';
import { getTablePrivacy } from '@cp/domain';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type pg from 'pg';

/** Every registered table with its column names and privacy classes. */
export function privacyTableColumns(): readonly PrivacyTableColumns[] {
  const tables: PrivacyTableColumns[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const table: PgTable = value;
    const name = getTableName(table);
    const privacy = getTablePrivacy(name);
    if (privacy === undefined) continue;
    tables.push({
      table: name,
      privacyClass: privacy.class,
      columns: Object.values(getTableColumns(table)).map((column) => column.name),
      ...(privacy.columns === undefined ? {} : { columnClasses: privacy.columns }),
    });
  }
  return tables;
}

let keys: readonly string[] | undefined;

/** Column names never serialised into a prompt or a log line. */
export function guideRedactionKeys(): readonly string[] {
  keys ??= redactionKeys(privacyTableColumns());
  return keys;
}

export function guideReaderRunner(pool: pg.Pool): RunAsGuideReader {
  // An empty app.trip reads back as unset, so trip-scoped views return nothing without a trip.
  return (uid, tripId, fn) => withGuideReader(pool, uid, tripId ?? '', fn);
}

export function buildGuideContext(pool: pg.Pool, input: BuildContextInput): Promise<GuideContext> {
  return buildContext(input, {
    runAsGuideReader: guideReaderRunner(pool),
    redactKeys: guideRedactionKeys(),
  });
}
