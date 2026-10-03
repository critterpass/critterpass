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
  /** Why it failed, for the caller to report. */
  readonly error?: unknown;
  /** Runs the query again (after a failure). */
  readonly retry?: () => void;
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
    error?: unknown;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (key === null || params === null) return undefined;
    const controller = new AbortController();
    const bound = [...params];
    const load = () =>
      db.getAll<Row>(sql, bound).then(
        (rows) => {
          if (!controller.signal.aborted) setState({ key, rows, failed: false });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setState({ key, rows: [], failed: true, error });
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
  }, [db, key, attempt]);
  return state !== null && state.key === key
    ? {
        rows: state.rows,
        loaded: true,
        failed: state.failed,
        error: state.error,
        retry: () => setAttempt((n) => n + 1),
      }
    : { rows: [], loaded: false };
}
