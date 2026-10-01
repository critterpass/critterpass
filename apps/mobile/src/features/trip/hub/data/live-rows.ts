/**
 * Live local queries for the trip day: a query with bound parameters runs now and again whenever
 * one of its tables changes; `null` params skip it until a value it needs is known. Also the uid
 * the local database is bound to (the signed-in member).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

export function watchQuery<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
  onError?: () => void,
): () => void {
  const controller = new AbortController();
  const load = () =>
    db.getAll<Row>(sql, [...params]).then(
      (rows) => {
        if (!controller.signal.aborted) onRows(rows);
      },
      () => {
        if (!controller.signal.aborted) onError?.();
      },
    );
  void load();
  db.onChange(
    { onChange: () => load() },
    { tables: [...tables], throttleMs: 30, signal: controller.signal },
  );
  return () => controller.abort();
}

export interface LiveRows<Row> {
  readonly rows: readonly Row[];
  readonly loaded: boolean;
  /** The read threw (and no later one has answered): there is nothing to wait for. */
  readonly failed: boolean;
}

export function useLiveRows<Row>(
  sql: string,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveRows<Row> {
  const { db } = useLocalFirst();
  const key = params === null ? null : `${sql}\u0000${JSON.stringify(params)}`;
  const [state, setState] = useState<{
    key: string;
    rows: readonly Row[];
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (key === null || params === null) return undefined;
    return watchQuery<Row>(
      db,
      sql,
      [...params],
      tables,
      (rows) => setState({ key, rows, failed: false }),
      // A failed first read is an answer too; rows already shown stay until the next one lands.
      () => setState((was) => (was?.key === key ? was : { key, rows: [], failed: true })),
    );
    // `tables` is a module constant at every call site and `params` is folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key]);
  if (state === null || state.key !== key) return { rows: [], loaded: false, failed: false };
  return { rows: state.rows, loaded: !state.failed, failed: state.failed };
}

const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  const { rows } = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], ['local_state']);
  return rows[0]?.value ?? null;
}
