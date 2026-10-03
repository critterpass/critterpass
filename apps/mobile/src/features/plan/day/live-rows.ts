/**
 * A live local query with bound parameters: runs now and again whenever one of `tables` changes,
 * with `loaded` false until the first delivery. `null` params skip the query (something it
 * depends on is not known yet).
 */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

export interface LiveRows<Row> {
  readonly rows: readonly Row[];
  readonly loaded: boolean;
  /** The query failed: delivered as loaded with no rows, so a screen never waits on it forever. */
  readonly failed?: boolean;
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
    const controller = new AbortController();
    const bound = [...params];
    const load = () =>
      db.getAll<Row>(sql, bound).then(
        (rows) => {
          if (!controller.signal.aborted) setState({ key, rows, failed: false });
        },
        () => {
          if (!controller.signal.aborted) setState({ key, rows: [], failed: true });
        },
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
    ? { rows: state.rows, loaded: true, failed: state.failed }
    : { rows: [], loaded: false };
}
