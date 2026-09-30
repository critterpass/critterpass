/**
 * Synced rows as React state for the guide screens: one parameterised query, re-read whenever one
 * of its tables changes. `sql: null` reads nothing (e.g. before the thread is known).
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

export function watchQuery<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
): () => void {
  const controller = new AbortController();
  const load = () =>
    db.getAll<Row>(sql, [...params]).then(
      (rows) => {
        if (!controller.signal.aborted) onRows(rows);
      },
      () => undefined,
    );
  void load();
  db.onChange(
    { onChange: () => load() },
    { tables: [...tables], throttleMs: 30, signal: controller.signal },
  );
  return () => controller.abort();
}

/** `null` until the first read lands, then the rows. */
export function useLiveQuery<Row>(
  sql: string | null,
  params: readonly unknown[],
  tables: readonly string[],
): readonly Row[] | null {
  const { db } = useLocalFirst();
  const [rows, setRows] = useState<{ key: string; rows: readonly Row[] } | null>(null);
  const key = sql === null ? null : `${sql}\u0000${JSON.stringify(params)}`;
  useEffect(() => {
    if (sql === null || key === null) return undefined;
    return watchQuery<Row>(db, sql, params, tables, (next) => setRows({ key, rows: next }));
    // `params` and `tables` are part of `key`, or constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key]);
  return rows !== null && rows.key === key ? rows.rows : null;
}
