/** Rows of one watched local query, kept in React state and dropped when the query changes. */
import { useEffect, useState } from 'react';

export type RowWatcher = <Row>(
  sql: string,
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
) => () => void;

const NO_ROWS: never[] = [];

export function useRows<Row>(
  watch: RowWatcher,
  sql: string | null,
  tables: readonly string[],
): Row[] {
  const [state, setState] = useState<{ readonly sql: string | null; readonly rows: Row[] }>({
    sql: null,
    rows: [],
  });
  useEffect(() => {
    if (sql === null) return undefined;
    return watch<Row>(sql, tables, (rows) => setState({ sql, rows }));
    // `tables` is a module constant at every call site; the query identity is `sql`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, sql]);
  // Rows of an earlier query (another trip, a signed-out user) never leak into the next one.
  return sql !== null && state.sql === sql ? state.rows : NO_ROWS;
}
