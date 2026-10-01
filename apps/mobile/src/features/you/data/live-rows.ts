/**
 * Live local queries for the profile screens: a query with bound parameters runs now and again
 * whenever one of its tables changes; `null` params skip it until the uid is known. Everything
 * reads synced rows, so the profile opens with no signal.
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
        // A table this build's local schema does not have yet reads as empty.
        () => {
          if (!controller.signal.aborted) setState({ key, rows: [] });
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
    ? { rows: state.rows, loaded: true }
    : { rows: [], loaded: false };
}

const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  const { rows } = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], ['local_state']);
  return rows[0]?.value ?? null;
}
