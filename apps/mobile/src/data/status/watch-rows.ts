/**
 * Live query helper for the headless status hooks: runs `sql` now and again whenever one of
 * `tables` changes, delivering rows until stopped.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

export function watchRows<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
  onError: (error: unknown) => void = () => undefined,
): () => void {
  const controller = new AbortController();
  const load = () =>
    db.getAll<Row>(sql).then((rows) => {
      if (!controller.signal.aborted) onRows(rows);
    }, onError);
  void load();
  db.onChange(
    { onChange: () => load() },
    { tables: [...tables], throttleMs: 30, signal: controller.signal },
  );
  return () => controller.abort();
}

/** `watchRows` as React state, mapped once per delivery. */
export function useWatchedRows<Row, Item>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  tables: readonly string[],
  map: (row: Row) => Item,
): readonly Item[] {
  const [items, setItems] = useState<readonly Item[]>([]);
  useEffect(
    () => watchRows<Row>(db, sql, tables, (rows) => setItems(rows.map(map))),
    // `tables` and `map` are module constants at every call site; the query identity is `sql`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, sql],
  );
  return items;
}
