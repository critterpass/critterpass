/**
 * A live local query with bound parameters: runs now and again whenever one of `tables` changes,
 * with `loaded` false until the first delivery.
 */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

export interface LiveRows<Row> {
  readonly rows: readonly Row[];
  readonly loaded: boolean;
}

const NONE: readonly never[] = [];

export function useLiveRows<Row>(
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
): LiveRows<Row> {
  const { db } = useLocalFirst();
  const key = `${sql}\u0000${JSON.stringify(params)}`;
  const [state, setState] = useState<{ key: string; rows: readonly Row[] } | null>(null);
  useEffect(() => {
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
    : { rows: NONE, loaded: false };
}
