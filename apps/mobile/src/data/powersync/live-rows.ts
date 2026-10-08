/**
 * The app's live-query hook: `useLiveRows(sql, params, tables)` reads a local query and follows its
 * tables. Every component reading the same query shares one watcher and one result
 * (`live-query-store.ts`), and what the hook returns keeps its identity until the rows really
 * change, so a table change that leaves a query's answer alone re-renders nobody. `null` params
 * skip the query (something it depends on is not known yet).
 *
 * `useLiveRows` reports a failed read as loaded with `failed`; `useQuietLiveRows` keeps waiting (or
 * keeps what it had) instead. Feature hooks with another shape derive it with `liveView`.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useContext, useMemo, useSyncExternalStore } from 'react';

import { LocalFirstContext } from './local-first-context';
import {
  IDLE_QUERY,
  liveQuery,
  liveQueryKey,
  NO_ROWS,
  type LiveQueryState,
} from './live-query-store';

export { NO_ROWS, watchQuery, type LiveQueryState } from './live-query-store';

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

/** Rows and whether the first answer has landed; a failed read is not an answer. */
export interface QuietLiveRows<Row> {
  readonly rows: readonly Row[];
  readonly loaded: boolean;
}

const NOT_LOADED: QuietLiveRows<never> = { rows: NO_ROWS, loaded: false };

const noSubscription = () => () => undefined;
const idleState = () => IDLE_QUERY;

/**
 * The shared state of one query on `db`. A `null` database, sql or params reads nothing. `tables`
 * is a module constant at every call site; it is part of the query's identity all the same.
 */
export function useLiveQueryStateOn<Row>(
  db: AbstractPowerSyncDatabase | null,
  sql: string | null,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveQueryState<Row> {
  const key =
    db === null || sql === null || params === null ? null : liveQueryKey(sql, params, tables);
  const query = useMemo(
    () =>
      db === null || sql === null || params === null || key === null
        ? null
        : liveQuery<Row>(db, sql, params, tables, key),
    // `sql`, `params` and `tables` are folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, key],
  );
  return useSyncExternalStore<LiveQueryState<Row>>(
    query?.subscribe ?? noSubscription,
    query?.getState ?? idleState,
  );
}

/** `useLiveQueryStateOn` for the session's database; reads nothing until the session is up. */
export function useLiveQueryState<Row>(
  sql: string | null,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveQueryState<Row> {
  const db = useContext(LocalFirstContext)?.db ?? null;
  return useLiveQueryStateOn<Row>(db, sql, params, tables);
}

/**
 * A view of a query's state that is computed once per state, so every reader of that state gets
 * the same object back. `derive` must return its own constants for states it treats alike.
 */
export function liveView<View>(
  derive: (state: LiveQueryState<unknown>) => View,
): (state: LiveQueryState<unknown>) => View {
  const views = new WeakMap<LiveQueryState<unknown>, { readonly view: View }>();
  return (state) => {
    let cached = views.get(state);
    if (cached === undefined) {
      cached = { view: derive(state) };
      views.set(state, cached);
    }
    return cached.view;
  };
}

const reportingView = liveView((state): LiveRows<unknown> => {
  if (state.failed) {
    return { rows: NO_ROWS, loaded: true, failed: true, error: state.error, retry: state.retry };
  }
  if (!state.answered) return NOT_LOADED;
  return { rows: state.rows, loaded: true, failed: false, error: undefined, retry: state.retry };
});

const quietByRows = new WeakMap<readonly unknown[], QuietLiveRows<unknown>>();

/** `{ rows, loaded }` for a state: one object per rows array, whatever else the state says. */
export function quietView<Row>(state: LiveQueryState<Row>): QuietLiveRows<Row> {
  if (!state.answered) return NOT_LOADED;
  let view = quietByRows.get(state.rows);
  if (view === undefined) {
    view = { rows: state.rows, loaded: true };
    quietByRows.set(state.rows, view);
  }
  return view as QuietLiveRows<Row>;
}

/** A live query whose failure is an answer: `loaded` with no rows, `failed`, and a `retry`. */
export function useLiveRows<Row>(
  sql: string,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveRows<Row> {
  return reportingView(useLiveQueryState<Row>(sql, params, tables)) as LiveRows<Row>;
}

/**
 * A live query whose failure is not an answer: `loaded` stays false until a read lands, and rows
 * already shown stay while a later read fails.
 */
export function useQuietLiveRows<Row>(
  sql: string,
  params: readonly unknown[] | null,
  tables: readonly string[],
): QuietLiveRows<Row> {
  return quietView(useLiveQueryState<Row>(sql, params, tables));
}
