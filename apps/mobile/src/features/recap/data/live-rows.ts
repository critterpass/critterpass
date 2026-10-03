/**
 * Live local queries for the recap: a query runs now and again whenever one of its tables changes;
 * `null` params skip it until a value it needs is known. Also the uid the local database is bound
 * to (the signed-in member).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

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
    const load = () =>
      db.getAll<Row>(sql, [...params]).then(
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

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  const { rows } = useLiveRows<{ value: string }>(
    'SELECT value FROM local_state WHERE id = ?',
    [OWNER_UID_KEY],
    ['local_state'],
  );
  return rows[0]?.value ?? null;
}
