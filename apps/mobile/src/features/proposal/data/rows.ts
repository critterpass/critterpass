/**
 * A live local query with bound parameters for the proposal screens: runs now and again whenever
 * one of `tables` changes, with `loaded` false until the first delivery. `null` params skip the
 * query (something it depends on is not known yet).
 */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

export interface LiveRows<Row> {
  readonly rows: readonly Row[];
  readonly loaded: boolean;
}

export function useLiveRows<Row>(
  sql: string,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveRows<Row> {
  const { db } = useLocalFirst();
  const key = params === null ? null : `${sql}\u0000${JSON.stringify(params)}`;
  const [state, setState] = useState<{ key: string; rows: readonly Row[] } | null>(null);
  useEffect(() => {
    if (key === null || params === null) return undefined;
    const controller = new AbortController();
    const bound = [...params];
    const load = () =>
      db.getAll<Row>(sql, bound).then(
        (rows) => {
          if (!controller.signal.aborted) setState({ key, rows });
        },
        () => undefined,
      );
    void load();
    db.onChange(
      { onChange: () => load() },
      { tables: [...tables], throttleMs: 30, signal: controller.signal },
    );
    return () => controller.abort();
    // `tables` is a module constant at every call site and `params` is folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key]);
  return state !== null && state.key === key
    ? { rows: state.rows, loaded: true }
    : { rows: [], loaded: false };
}

/** A JSON column as synced (text), or `fallback` when absent or unreadable. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
