/**
 * Live local queries for the trip day: a query with bound parameters runs now and again whenever
 * one of its tables changes; `null` params skip it until a value it needs is known. Also the uid
 * the local database is bound to (the signed-in member). Over the app's shared hooks.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import {
  liveView,
  NO_ROWS,
  useLiveQueryState,
  watchQuery as watchLocalQuery,
} from '@/data/powersync/live-rows';
import { useSessionUid } from '@/data/powersync/use-session-uid';

export function watchQuery<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
  onError?: () => void,
): () => void {
  return watchLocalQuery<Row>(db, sql, params, tables, onRows, () => onError?.());
}

export interface LiveRows<Row> {
  readonly rows: readonly Row[];
  readonly loaded: boolean;
  /** The read threw (and no later one has answered): there is nothing to wait for. */
  readonly failed: boolean;
}

const WAITING: LiveRows<never> = { rows: NO_ROWS, loaded: false, failed: false };
const FAILED: LiveRows<never> = { rows: NO_ROWS, loaded: false, failed: true };

// A failed first read is an answer too; rows already shown stay until the next one lands.
const hubView = liveView((state): LiveRows<unknown> => {
  if (state.answered) return { rows: state.rows, loaded: true, failed: false };
  return state.failed ? FAILED : WAITING;
});

export function useLiveRows<Row>(
  sql: string,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveRows<Row> {
  return hubView(useLiveQueryState<Row>(sql, params, tables)) as LiveRows<Row>;
}

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  return useSessionUid();
}
