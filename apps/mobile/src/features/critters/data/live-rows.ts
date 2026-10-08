/**
 * Live local queries for the critter screens: a query with bound parameters runs now and again
 * whenever one of its tables changes; `null` params skip it until a value it needs is known.
 * Everything reads synced rows, so the Critterdex and encounters work with no signal. Over the
 * app's shared hooks.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a developer-facing warning, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect } from 'react';

import {
  quietView,
  useLiveQueryState,
  watchQuery as watchLocalQuery,
  type QuietLiveRows,
} from '@/data/powersync/live-rows';
import { useSessionUid } from '@/data/powersync/use-session-uid';

export type LiveRows<Row> = QuietLiveRows<Row>;

// A query that cannot run leaves its screen waiting for ever; say so where it can be read.
function warnFailed(sql: string, error: unknown): void {
  console.warn('[critters] local query failed', sql.slice(0, 80), error);
}

export function watchQuery<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
): () => void {
  return watchLocalQuery<Row>(db, sql, params, tables, onRows, (error) => warnFailed(sql, error));
}

export function useLiveRows<Row>(
  sql: string,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveRows<Row> {
  const state = useLiveQueryState<Row>(sql, params, tables);
  const { failed, error } = state;
  useEffect(() => {
    if (failed) warnFailed(sql, error);
  }, [failed, error, sql]);
  return quietView(state);
}

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  return useSessionUid();
}
