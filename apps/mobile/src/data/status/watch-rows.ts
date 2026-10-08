/**
 * Live query helpers for the headless status hooks, over the app's shared live queries
 * (`data/powersync/live-rows.ts`): `watchRows` delivers a parameterless query's rows now and after
 * every change to `tables`; `useWatchedRows` is the same query as React state, mapped once per
 * distinct result.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { NO_ROWS, useLiveQueryStateOn, watchQuery } from '../powersync/live-rows';

const NO_PARAMS: readonly unknown[] = [];

export function watchRows<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
  onError: (error: unknown) => void = () => undefined,
): () => void {
  return watchQuery<Row>(db, sql, NO_PARAMS, tables, onRows, onError);
}

const mappedByRows = new WeakMap<readonly unknown[], Map<unknown, readonly unknown[]>>();

/** `rows.map(map)`, computed once per rows array and `map`, so equal rows give the same items. */
function mapOnce<Row, Item>(rows: readonly Row[], map: (row: Row) => Item): readonly Item[] {
  if (rows.length === 0) return NO_ROWS;
  let byMap = mappedByRows.get(rows);
  if (byMap === undefined) {
    byMap = new Map();
    mappedByRows.set(rows, byMap);
  }
  let items = byMap.get(map);
  if (items === undefined) {
    items = rows.map(map);
    byMap.set(map, items);
  }
  return items as readonly Item[];
}

/** `watchRows` as React state: empty until the first answer, and unchanged by a failed read. */
export function useWatchedRows<Row, Item>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  tables: readonly string[],
  map: (row: Row) => Item,
): readonly Item[] {
  return mapOnce(useLiveQueryStateOn<Row>(db, sql, NO_PARAMS, tables).rows, map);
}
